BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- The separate index migration must complete concurrently before this short
-- transaction. An interrupted build can leave an invalid index; never proceed.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='incident_prepare_auth_notifications'
        AND (p.pronargs<>0 OR p.prorettype<>'uuid'::regtype OR NOT p.proretset)) THEN
    RAISE EXCEPTION 'An earlier candidate helper exists; inspect deployment history before applying policy';
  END IF;
  IF (SELECT count(*) FROM pg_index WHERE indexrelid IN
      (to_regclass('public.api_logs_auth_client_time'),to_regclass('public.api_logs_auth_operation'),
       to_regclass('public.api_logs_auth_refresh_reference'),to_regclass('public.incident_receipts_owner_attempt'))
      AND indisvalid AND indisready)<>4 THEN
    RAISE EXCEPTION 'Build and verify the auth email indexes concurrently before applying policy';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION incident_auth_event_time(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE STRICT SET search_path=public AS $$
BEGIN
  RETURN value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;

-- Runs under the same lock as ingest, reservation, freeze and claim. A quiet
-- notification does not resolve its diagnostic, delete receipts, or mute a
-- later blocked action/persistent recurrence. Only unfrozen mail is cancelled.
CREATE OR REPLACE FUNCTION incident_prepare_auth_notifications() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  g incident_groups; clients jsonb; c jsonb; sample jsonb; info jsonb; snapshot jsonb;
  recovered integer; outstanding integer; blocked integer; generate_blocked integer; sign_in_required integer; persistent integer; widespread integer;
  known boolean; reason text; notice text; proof_at timestamptz; cutoff timestamptz;
  renewed_at timestamptz; mail_count integer; scope_start timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  INSERT INTO incident_daily_budgets(day) VALUES ((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;
  FOR g IN SELECT * FROM incident_groups
      WHERE event='token_refresh_failed' AND source='extension_background' AND severity='transient'
        AND status<>'resolved' AND evidence_expires_at>now()
        AND (notification_status IN ('quiet','pending','failed','sending','sent')
          OR (notification_status='suppressed' AND notification_error IN ('Email policy: alert budget exhausted','Delivery day email budget exhausted')))
        AND NOT (notification_status IN ('pending','failed','sending') AND coalesce(notification_payload ? 'email',false))
        AND NOT (notification_status='sending' AND coalesce(notification_locked_until>now(),false))
        AND (notification_next_at IS NULL OR notification_next_at<=now())
        AND (last_seen>=now()-interval '30 minutes' OR notification_status IN ('pending','failed','sending')
          OR (last_seen>=now()-interval '6 hours' AND notification_status IN ('quiet','suppressed'))
          OR (last_seen>=now()-interval '6 hours' AND notification_status='sent' AND notification_payload->'authPolicy'->>'reason' IN ('persistent','widespread')))
      ORDER BY CASE WHEN notification_status IN ('pending','failed','sending') THEN 0 ELSE 1 END,
        notification_next_at NULLS FIRST,last_seen DESC LIMIT 50 FOR UPDATE LOOP
    IF (g.notification_status IN ('pending','failed','sending') AND g.notification_payload ? 'email')
      OR (g.notification_status='sending' AND g.notification_locked_until>now()) THEN CONTINUE; END IF;
    scope_start:=CASE WHEN g.notification_status='sent' AND g.notification_payload->'authPolicy'->>'reason' IN ('persistent','widespread')
      THEN greatest(now()-interval '6 hours',incident_auth_event_time(g.notification_payload->'authPolicy'->>'windowStart')) ELSE now()-interval '30 minutes' END;

    -- Complete retained cohort, not the three rotating examples. Examples are
    -- a fallback for originals that reached the diagnostic but not api_logs.
    WITH failures AS MATERIALIZED (
      SELECT r.attempt_id,r.owner_key,r.occurred_at,r.created_at,
        coalesce(l.full_request_body->'context',e.value->'context','{}'::jsonb) AS context,
        jsonb_build_object('eventId',r.id,'occurredAt',r.occurred_at,'userId',nullif(r.owner_key,'anonymous'),
          'identityVerified',l.user_id IS NOT NULL OR e.value->'identityVerified'='true'::jsonb,
          'source',g.source,'operationId',r.attempt_id,
          'context',coalesce(l.full_request_body->'context',e.value->'context','{}'::jsonb)) AS example
      FROM incident_receipts r
      LEFT JOIN LATERAL (SELECT a.user_id,a.full_request_body FROM api_logs a
        WHERE a.user_id=nullif(r.owner_key,'anonymous')::uuid AND a.endpoint='/event/token_refresh_failed'
          AND a.full_request_body->'context'->>'operationId'=r.attempt_id
          AND a.created_at>=r.created_at-interval '5 minutes' AND a.created_at<=now()
        ORDER BY a.created_at DESC LIMIT 1) l ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(g.examples) WHERE value->>'eventId'=r.id::text LIMIT 1) e ON true
      WHERE r.incident_id=g.id AND r.occurred_at BETWEEN now()-interval '6 hours' AND now() AND r.created_at<=now()
    ), scopes AS (
      SELECT DISTINCT owner_key,context->>'analyticsClientId' AS client FROM failures
      WHERE occurred_at>=scope_start OR EXISTS (
        SELECT 1 FROM api_logs a WHERE a.user_id=nullif(failures.owner_key,'anonymous')::uuid
          AND a.endpoint='/event/auth_session_result'
          AND a.created_at BETWEEN now()-interval '10 minutes' AND now()
          AND a.full_request_body->'context'->>'analyticsClientId'=failures.context->>'analyticsClientId'
          AND a.full_request_body->'context'->>'operationId'=failures.attempt_id
      ) OR EXISTS (
        SELECT 1 FROM api_logs a WHERE a.user_id=nullif(failures.owner_key,'anonymous')::uuid
          AND a.endpoint='/event/auth_action_result'
          AND a.created_at BETWEEN now()-interval '10 minutes' AND now()
          AND a.full_request_body->'context'->>'analyticsClientId'=failures.context->>'analyticsClientId'
          AND a.full_request_body->'context'->>'authRefreshOperationId'=failures.attempt_id
      )
    ), renewals AS MATERIALIZED (
        SELECT original.owner_key,original.context->>'analyticsClientId' AS client,
          max(t.at) AS at,max(t.at) FILTER (WHERE a.full_request_body->'context'->'signInRequired'='true') AS required_at,
          max(a.created_at) AS received_at
        FROM api_logs a
        JOIN failures original ON a.user_id=nullif(original.owner_key,'anonymous')::uuid
          AND original.context->>'analyticsClientId'=a.full_request_body->'context'->>'analyticsClientId'
          AND original.attempt_id=a.full_request_body->'context'->>'operationId'
        CROSS JOIN LATERAL (SELECT incident_auth_event_time(a.full_request_body->>'occurredAt') AS at) t
        WHERE a.endpoint='/event/auth_session_result'
          AND a.created_at BETWEEN now()-interval '35 minutes' AND now()
          AND a.full_request_body->>'source'='extension_background'
          AND (regexp_match(a.full_request_body->>'extensionVersion','^([0-9]+)\.([0-9]+)\.([0-9]+)(?:\.[0-9]+)?$'))::numeric[]>=ARRAY[1,4,21]::numeric[]
          AND jsonb_typeof(a.full_request_body->'context'->'signInRequired')='boolean'
          AND ((a.full_request_body->'context'->>'resultStatus'='silent_renewed'
              AND a.full_request_body->'context'->>'reason'='token_refresh_success'
              AND a.full_request_body->'context'->>'authRefreshOperationId' ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
            OR (a.full_request_body->'context'->>'resultStatus'='signed_in' AND a.full_request_body->'context'->>'reason'='auth_success'))
          AND t.at BETWEEN original.occurred_at AND now()
        GROUP BY original.owner_key,original.context->>'analyticsClientId'
    ), actions AS MATERIALIZED (
        SELECT original.owner_key,original.context->>'analyticsClientId' AS client,
          max(t.at) AS at,max(a.created_at) AS received_at FROM api_logs a
        JOIN failures original ON a.user_id=nullif(original.owner_key,'anonymous')::uuid
          AND original.context->>'analyticsClientId'=a.full_request_body->'context'->>'analyticsClientId'
          AND original.attempt_id=a.full_request_body->'context'->>'authRefreshOperationId'
        CROSS JOIN LATERAL (SELECT incident_auth_event_time(a.full_request_body->>'occurredAt') AS at) t
        WHERE a.endpoint='/event/auth_action_result'
          AND a.created_at BETWEEN now()-interval '35 minutes' AND now()
          AND a.full_request_body->>'source'='extension_content'
          AND (regexp_match(a.full_request_body->>'extensionVersion','^([0-9]+)\.([0-9]+)\.([0-9]+)(?:\.[0-9]+)?$'))::numeric[]>=ARRAY[1,4,19]::numeric[]
          AND a.full_request_body->'context'->>'entryPoint'='generate'
          AND a.full_request_body->'context'->>'resultStatus'='blocked'
          AND (a.full_request_body->'context'->'statusCode'='401' OR a.full_request_body->'context'->>'reason'='session_missing')
          AND a.full_request_body->'context'->>'operationId' ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
          AND length(a.full_request_body->'context'->>'generationAttemptId')>0
          AND t.at BETWEEN original.occurred_at AND now()
        GROUP BY original.owner_key,original.context->>'analyticsClientId'
    ), facts AS (
      SELECT s.*,renewal.at AS renewed_at,renewal.required_at,action.at AS blocked_at,
        greatest(CASE WHEN renewal.required_at IS NOT NULL THEN renewal.received_at END,action.received_at,max(f.created_at)) AS proof_at,
        count(DISTINCT f.attempt_id) FILTER (WHERE f.occurred_at>coalesce(renewal.at,'-infinity')) AS outstanding,
        min(f.occurred_at) FILTER (WHERE f.occurred_at>coalesce(renewal.at,'-infinity')) AS first_failure,
        max(f.occurred_at) FILTER (WHERE f.occurred_at>coalesce(renewal.at,'-infinity')) AS last_failure,
        bool_and(coalesce(f.context->>'entryPoint' IN ('scheduled_refresh','startup_restore','sdk_refresh')
          AND coalesce(f.context->>'parentOperationId','')='' AND s.client IS NOT NULL,false)) AS known,
        (array_agg(f.example ORDER BY f.occurred_at DESC))[1] AS example
      FROM scopes s JOIN failures f ON f.owner_key=s.owner_key AND (f.context->>'analyticsClientId') IS NOT DISTINCT FROM s.client
      LEFT JOIN renewals renewal ON renewal.owner_key=s.owner_key AND renewal.client=s.client
      LEFT JOIN actions action ON action.owner_key=s.owner_key AND action.client=s.client
      WHERE f.occurred_at>=scope_start OR action.at>=now()-interval '30 minutes' OR renewal.required_at>=now()-interval '30 minutes'
      GROUP BY s.owner_key,s.client,renewal.at,renewal.required_at,renewal.received_at,action.at,action.received_at
    ) SELECT coalesce(jsonb_agg(to_jsonb(facts)),'[]') INTO clients FROM facts;

    recovered:=0; outstanding:=0; blocked:=0; generate_blocked:=0; sign_in_required:=0; persistent:=0; widespread:=0; known:=jsonb_array_length(clients)>0; sample:=NULL; proof_at:=NULL; renewed_at:=NULL;
    FOR c IN SELECT value FROM jsonb_array_elements(clients) LOOP
      known:=known AND coalesce((c->>'known')::boolean,false);
      proof_at:=greatest(proof_at,(c->>'proof_at')::timestamptz);
      renewed_at:=greatest(renewed_at,(c->>'renewed_at')::timestamptz);
      IF (c->>'outstanding')::integer=0 THEN recovered:=recovered+1; ELSE outstanding:=outstanding+1; END IF;
      IF c->>'blocked_at' IS NOT NULL THEN generate_blocked:=generate_blocked+1; END IF;
      IF c->>'required_at' IS NOT NULL THEN sign_in_required:=sign_in_required+1; END IF;
      IF c->>'blocked_at' IS NOT NULL OR c->>'required_at' IS NOT NULL THEN
        blocked:=blocked+1; sample:=c->'example';
      ELSIF (c->>'outstanding')::integer>=3 AND (c->>'last_failure')::timestamptz>=now()-interval '30 minutes'
        AND (c->>'last_failure')::timestamptz-(c->>'first_failure')::timestamptz>=interval '5 minutes' THEN
        persistent:=persistent+1; IF blocked=0 THEN sample:=c->'example'; END IF;
      END IF;
      IF (c->>'outstanding')::integer>0 AND (c->>'last_failure')::timestamptz>=now()-interval '10 minutes' THEN
        widespread:=widespread+1; IF sample IS NULL THEN sample:=c->'example'; END IF;
      END IF;
    END LOOP;
    -- Unknown/foreground attribution never gets suppressed by this policy.
    IF NOT known THEN
      IF g.notification_status NOT IN ('pending','failed','sending') THEN
        UPDATE incident_groups SET notification_next_at=now()+interval '2 minutes' WHERE id=g.id;
      END IF;
      RETURN NEXT g.id; CONTINUE;
    END IF;
    reason:=CASE WHEN blocked>0 THEN 'blocked' WHEN persistent>0 THEN 'persistent' WHEN widespread>=3 THEN 'widespread' ELSE NULL END;
    notice:=g.notification_payload->'authPolicy'->>'reason';
    cutoff:=incident_auth_event_time(g.notification_payload->'authPolicy'->>'checkedAt');
    IF reason IS NULL AND recovered>0 AND outstanding=0 AND blocked=0
        AND g.notification_status='sent' AND notice IN ('persistent','widespread') THEN reason:='recovery'; END IF;

    IF reason IS NULL THEN
      IF g.notification_status IN ('pending','failed','sending') THEN
        IF g.notification_budget_day IS NOT NULL THEN
          UPDATE incident_daily_budgets SET emails=greatest(0,emails-1) WHERE day=g.notification_budget_day;
        END IF;
        UPDATE incident_groups SET notification_status='quiet',notification_budget_day=NULL,
          notification_locked_until=NULL,notification_error='Email policy: background-only; no blocked action or persistent failures',
          notification_next_at=now()+interval '2 minutes' WHERE id=g.id;
      ELSIF g.notification_status='suppressed' THEN
        UPDATE incident_groups SET notification_status='quiet',notification_error='Email policy: background-only; no blocked action or persistent failures',
          notification_next_at=now()+interval '2 minutes' WHERE id=g.id;
      ELSE
        UPDATE incident_groups SET notification_next_at=now()+interval '2 minutes' WHERE id=g.id;
      END IF;
      CONTINUE;
    END IF;
    IF g.notification_status='sent' AND reason<>'recovery' AND (proof_at<=cutoff
        OR (notice<>'recovery' AND reason<>'blocked' AND g.notified_at>now()-interval '1 hour')) THEN
      UPDATE incident_groups SET notification_next_at=now()+interval '2 minutes' WHERE id=g.id;
      CONTINUE;
    END IF;
    info:=jsonb_build_object('reason',reason,'checkedAt',now(),'windowStart',CASE WHEN reason='recovery' THEN scope_start ELSE now()-interval '30 minutes' END,
      'blockedClients',blocked,'persistentClients',persistent,'recentFailureClients',widespread,
      'generateBlockedClients',generate_blocked,'signInRequiredClients',sign_in_required,
      'unrecoveredClients',outstanding,'recoveredClients',recovered,'renewedAt',renewed_at);
    snapshot:=jsonb_build_object('incidentId',g.id,'event',g.event,'source',g.source,'stage',g.stage,
      'severity',g.severity,'release',g.release,'market',g.market,'example',coalesce(sample,g.notification_payload->'example',g.examples->-1),'authPolicy',info);
    IF NOT incident_fit_payload(greatest(0,octet_length(snapshot::text)-coalesce(octet_length(g.notification_payload::text),0))) THEN CONTINUE; END IF;
    IF g.notification_status NOT IN ('pending','failed','sending') THEN
      UPDATE incident_daily_budgets SET emails=emails+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND emails<19 RETURNING emails INTO mail_count;
      IF NOT FOUND THEN
        IF g.notification_status<>'suppressed' THEN
          UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
        END IF;
        UPDATE incident_groups SET notification_status='suppressed',notification_payload=snapshot,
          notification_error='Email policy: alert budget exhausted',notification_next_at=now()+interval '2 minutes' WHERE id=g.id;
        CONTINUE;
      END IF;
      UPDATE incident_groups SET notification_key=gen_random_uuid(),notification_created_at=now(),notification_attempts=0,
        notification_budget_day=(now() AT TIME ZONE 'UTC')::date WHERE id=g.id;
    END IF;
    UPDATE incident_groups SET notification_status='pending',notification_payload=snapshot,
      notification_next_at=now(),notification_locked_until=NULL,notification_error=NULL WHERE id=g.id;
    RETURN NEXT g.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION incident_ingest(p_event jsonb, p_user_id uuid DEFAULT NULL, p_verified boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  event_id uuid:=(p_event->>'id')::uuid;
  owner_key text:=coalesce(p_user_id::text,'anonymous');
  previous incident_receipts;
  grouped incident_groups;
  kind text:=p_event->'definition'->>'kind';
  event_time timestamptz:=(p_event->>'occurredAt')::timestamptz;
  operation text:=coalesce(p_event->>'operationId',p_event->>'id');
  stage_name text:=coalesce(p_event->'definition'->>'stage',p_event->'context'->>'stage',p_event->'context'->>'lastConfirmedStage','unknown');
  example jsonb;
  attempts integer;
  mail_count integer;
  retain_example boolean:=true;
  progress_data jsonb;
  should_notify boolean:=false;
  recurred boolean:=false;
  incident_id uuid;
BEGIN
  -- The global diagnostic lock also protects caps against distinct-key floods.
  -- This transaction is deliberately small, with no network calls.
  PERFORM pg_advisory_xact_lock(73150030);
  SELECT * INTO previous FROM incident_receipts WHERE id=event_id;
  IF FOUND THEN
    -- An owner can become available between lookup and the original write.
    -- Recover attribution without creating a second occurrence or notification.
    IF previous.owner_key='anonymous' AND p_verified AND p_user_id IS NOT NULL
       AND previous.phone_key=p_event->>'phoneKey'
       AND EXISTS(SELECT 1 FROM incident_flows WHERE id='phone:'||previous.phone_key AND user_id=p_user_id AND identity_verified) THEN
      PERFORM incident_register_phone(previous.phone_key,p_user_id);
      previous.owner_key:=owner_key;
    END IF;
    IF previous.owner_key<>owner_key THEN RETURN jsonb_build_object('status','rejected','reason','identity_mismatch'); END IF;
    RETURN jsonb_build_object('status','duplicate','incidentId',previous.incident_id);
  END IF;
  IF octet_length((p_event-'businessLog')::text)>12288 OR octet_length(p_event::text)>49152 THEN RETURN jsonb_build_object('status','rejected','reason','oversized'); END IF;
  PERFORM incident_cleanup(50);
  IF (SELECT count(*) FROM incident_receipts)>=25000 THEN
    UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
    RETURN jsonb_build_object('status','rejected','reason','receipt_capacity');
  END IF;
  INSERT INTO incident_receipts(id,owner_key,phone_key,attempt_id,occurred_at) VALUES(event_id,owner_key,p_event->>'phoneKey',operation,event_time);
  UPDATE incident_daily_budgets SET client_dropped=client_dropped+least(10000,greatest(0,coalesce((p_event->'context'->>'queueDropped')::numeric,0)))::integer
    WHERE day=(now() AT TIME ZONE 'UTC')::date AND coalesce((p_event->'context'->>'queueDropped')::numeric,0)>0;
  IF p_event ? 'businessLog' AND p_event->'businessLog'<>'null'::jsonb THEN
    INSERT INTO api_logs(user_id,user_email,endpoint,request_method,response_status,user_agent,origin,ip_address,full_request_body)
      SELECT p_user_id, user_email,endpoint,request_method,response_status,user_agent,origin,ip_address,full_request_body
      FROM jsonb_populate_record(NULL::api_logs,p_event->'businessLog');
  END IF;
  -- Wake only groups referenced by this owner's new auth evidence. The
  -- owner/attempt index bounds this lookup; correlation still runs at claim.
  IF p_user_id IS NOT NULL AND p_event->>'event' IN ('auth_session_result','auth_action_result') THEN
    UPDATE incident_groups SET notification_next_at=now()
      WHERE event='token_refresh_failed' AND source='extension_background' AND severity='transient'
        AND id IN (SELECT r.incident_id FROM incident_receipts r WHERE r.owner_key=p_user_id::text
          AND r.attempt_id=CASE WHEN p_event->>'event'='auth_session_result'
            THEN p_event->'context'->>'operationId' ELSE p_event->'context'->>'authRefreshOperationId' END);
  END IF;

  IF kind IN ('incident','report') THEN
    SELECT * INTO grouped FROM incident_groups WHERE fingerprint=p_event->>'fingerprint' FOR UPDATE;
    IF grouped.id IS NULL AND (SELECT count(*) FROM incident_groups)>=500 THEN
      DELETE FROM incident_groups WHERE id=(SELECT id FROM incident_groups WHERE status='resolved' AND notification_status NOT IN ('pending','failed','sending') ORDER BY last_seen LIMIT 1);
    END IF;
    IF grouped.id IS NULL AND (SELECT count(*) FROM incident_groups)>=500 THEN
      UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
      IF kind='report' THEN
        DELETE FROM incident_receipts WHERE id=event_id;
        RETURN jsonb_build_object('status','rejected','reason','report_capacity');
      END IF;
      RETURN jsonb_build_object('status','accepted','suppressed','group_capacity');
    END IF;
    example:=jsonb_build_object('eventId',event_id,'occurredAt',event_time,'userId',p_user_id,'identityVerified',p_verified AND p_user_id IS NOT NULL,'trustedSource',(p_event->>'source'='backend' AND p_verified),'source',p_event->>'source','operationId',operation,'context',p_event->'context');
    retain_example:=incident_fit_payload(octet_length(example::text)+1024);
    IF NOT retain_example THEN
      UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
      IF kind='report' THEN
        DELETE FROM incident_receipts WHERE id=event_id;
        RETURN jsonb_build_object('status','rejected','reason','report_capacity');
      END IF;
    END IF;
    IF grouped.id IS NULL THEN
      INSERT INTO incident_groups(fingerprint,event,source,severity,release,market,stage,first_seen,last_seen,expires_at,evidence_expires_at,examples)
        VALUES(p_event->>'fingerprint',p_event->>'event',p_event->>'source',p_event->'definition'->>'severity',p_event->>'release',p_event->>'market',stage_name,event_time,event_time,event_time+interval '24 hours',event_time+interval '24 hours',CASE WHEN retain_example THEN jsonb_build_array(example) ELSE '[]'::jsonb END) RETURNING * INTO grouped;
      should_notify:=true;
    ELSE
      recurred:=grouped.status='resolved' AND event_time>coalesce(grouped.resolved_at,'-infinity'::timestamptz);
      should_notify:=recurred OR (grouped.status<>'resolved' AND grouped.notification_status='quiet');
      UPDATE incident_groups SET occurrences=occurrences+1,last_seen=greatest(last_seen,event_time),first_seen=least(first_seen,event_time),
        expires_at=greatest(last_seen,event_time)+interval '24 hours',
        evidence_expires_at=CASE WHEN status='resolved' AND NOT recurred THEN evidence_expires_at ELSE greatest(last_seen,event_time)+interval '24 hours' END,
        status=CASE WHEN recurred THEN 'open' ELSE status END,
        resolved_at=CASE WHEN recurred THEN NULL ELSE resolved_at END,
        examples=CASE WHEN NOT retain_example THEN examples WHEN jsonb_array_length(examples)<3 THEN examples||jsonb_build_array(example) ELSE jsonb_build_array(examples->0,examples->-1,example) END
        WHERE id=grouped.id RETURNING * INTO grouped;
    END IF;
    incident_id:=grouped.id;
    UPDATE incident_receipts SET incident_id=grouped.id WHERE id=event_id;
    -- New evidence makes an already assessed cohort eligible at the next
    -- claim without running its correlation query during ingest.
    IF grouped.event='token_refresh_failed' AND grouped.source='extension_background'
      AND grouped.severity='transient' AND grouped.notification_status IN ('quiet','suppressed','sent') THEN
      UPDATE incident_groups SET notification_next_at=now() WHERE id=grouped.id;
    END IF;
    SELECT count(DISTINCT attempt_id) INTO attempts FROM incident_receipts WHERE incident_receipts.incident_id=grouped.id AND occurred_at>=now()-interval '10 minutes';
    should_notify:=should_notify AND (p_verified OR kind='incident') AND (grouped.severity='blocking' OR (grouped.severity='transient' AND attempts>=3))
      AND grouped.notification_status NOT IN ('pending','failed','sending');
    IF should_notify AND incident_fit_payload(octet_length(example::text)+1024) THEN
      -- Defer only the reservation for background refresh mail. Cohort policy
      -- runs at notification claim, never in the product ingest transaction.
      IF grouped.event='token_refresh_failed' AND grouped.source='extension_background' AND grouped.severity='transient' THEN
        mail_count:=0;
      ELSE
        UPDATE incident_daily_budgets SET emails=emails+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND emails<19 RETURNING emails INTO mail_count;
      END IF;
      IF mail_count IS NOT NULL THEN
        UPDATE incident_groups SET notification_status='pending',notification_key=gen_random_uuid(),notification_created_at=now(),notification_budget_day=CASE WHEN mail_count=0 THEN NULL ELSE (now() AT TIME ZONE 'UTC')::date END,notification_next_at=greatest(now(),grouped.notified_at+interval '1 hour'),notification_attempts=0,
          notification_payload=jsonb_build_object('incidentId',grouped.id,'event',grouped.event,'stage',grouped.stage,'severity',grouped.severity,'release',grouped.release,'market',grouped.market,'example',example)
          WHERE id=grouped.id;
      ELSE
        UPDATE incident_groups SET notification_status='suppressed' WHERE id=grouped.id;
        UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
        UPDATE incident_daily_budgets SET emails=emails+1,overflow_reserved=true WHERE day=(now() AT TIME ZONE 'UTC')::date AND emails=19 AND NOT overflow_reserved;
        IF FOUND THEN
          UPDATE incident_groups SET notification_status='pending',notification_key=gen_random_uuid(),notification_created_at=now(),notification_budget_day=(now() AT TIME ZONE 'UTC')::date,notification_next_at=greatest(now(),grouped.notified_at+interval '1 hour'),notification_attempts=0,
            notification_payload=jsonb_build_object('incidentId',grouped.id,'event','Daily automatic email limit reached','stage','monitoring','severity','warning','release',grouped.release,'market',grouped.market,
              'example',jsonb_build_object('context',jsonb_build_object('message','Automatic issue emails are capped for today. Further incidents remain visible in Issues. This is the final automatic email reserved for today.')))
            WHERE id=grouped.id;
        END IF;
      END IF;
    END IF;
  END IF;

  IF kind<>'business' AND ((SELECT count(*) FROM incident_flows)<5000 OR EXISTS(SELECT 1 FROM incident_flows WHERE id=owner_key||':'||operation)) THEN
    progress_data:=jsonb_strip_nulls(jsonb_build_object('release',p_event->>'release','market',p_event->>'market',
      'phase',p_event->'context'->'phase','photoCount',p_event->'context'->'photoCount','uploadedCount',p_event->'context'->'uploadedCount',
      'confirmedPhotoCount',p_event->'context'->'confirmedPhotoCount','loadedBytes',p_event->'context'->'loadedBytes',
      'totalBytes',p_event->'context'->'totalBytes','itemIndex',p_event->'context'->'itemIndex'));
    IF NOT incident_fit_payload(octet_length(progress_data::text)) THEN progress_data:='{}'; END IF;
    INSERT INTO incident_flows(id,operation_id,user_id,identity_verified,phone_key,incident_id,stage,running,progress,last_progress_at,updated_at,expires_at)
      VALUES(owner_key||':'||operation,operation,p_user_id,p_verified AND p_user_id IS NOT NULL,p_event->>'phoneKey',incident_id,stage_name,coalesce((p_event->'definition'->>'running')::boolean,false),progress_data,event_time,event_time,event_time+interval '25 hours')
      ON CONFLICT(id) DO UPDATE SET
        incident_id=coalesce(excluded.incident_id,incident_flows.incident_id),
        phone_key=coalesce(excluded.phone_key,incident_flows.phone_key),
        stage=excluded.stage,running=excluded.running,progress=excluded.progress,
        last_progress_at=CASE WHEN incident_flows.stage<>excluded.stage OR incident_flows.progress<>excluded.progress THEN excluded.updated_at ELSE incident_flows.last_progress_at END,
        updated_at=excluded.updated_at,expires_at=excluded.updated_at+interval '25 hours'
      WHERE incident_flows.updated_at<=excluded.updated_at;
  END IF;
  RETURN jsonb_build_object('status','accepted','incidentId',incident_id);
END $$;

CREATE OR REPLACE FUNCTION incident_claim_notifications(p_limit integer DEFAULT 10) RETURNS SETOF incident_groups
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE grouped incident_groups; today date:=(now() AT TIME ZONE 'UTC')::date; auth_eligible uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  SELECT array_agg(id) INTO auth_eligible FROM incident_prepare_auth_notifications() AS eligible(id);
  INSERT INTO incident_daily_budgets(day) VALUES(today) ON CONFLICT DO NOTHING;
  UPDATE incident_groups SET notification_status='expired',notification_error='Delivery retry window expired'
    WHERE notification_status IN ('pending','failed','sending') AND notification_created_at<now()-interval '23 hours';
  FOR grouped IN SELECT * FROM incident_groups WHERE notification_status IN ('pending','failed','sending')
      AND notification_next_at<=now() AND (notification_locked_until IS NULL OR notification_locked_until<=now())
      AND (event<>'token_refresh_failed' OR source<>'extension_background' OR severity<>'transient'
        OR notification_payload ? 'email' OR id=ANY(auth_eligible))
      ORDER BY notification_next_at LIMIT least(greatest(p_limit,1),20) FOR UPDATE SKIP LOCKED LOOP
    IF grouped.notification_budget_day IS DISTINCT FROM today THEN
      UPDATE incident_daily_budgets SET emails=emails+1 WHERE day=today AND emails<19;
      IF NOT FOUND THEN
        UPDATE incident_groups SET notification_status='suppressed',notification_error='Delivery day email budget exhausted' WHERE id=grouped.id;
        UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=today;
        CONTINUE;
      END IF;
    END IF;
    UPDATE incident_groups SET notification_status='sending',notification_budget_day=today,
      notification_locked_until=now()+interval '2 minutes',notification_attempts=notification_attempts+1
      WHERE id=grouped.id RETURNING * INTO grouped;
    RETURN NEXT grouped;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION incident_auth_event_time(text),incident_prepare_auth_notifications() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
