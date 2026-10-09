BEGIN;

CREATE TABLE incident_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  event text NOT NULL,
  source text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('blocking','transient','warning')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  release text NOT NULL,
  market text NOT NULL,
  stage text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  examples jsonb NOT NULL DEFAULT '[]',
  evidence_expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  notification_status text NOT NULL DEFAULT 'quiet',
  notification_payload jsonb,
  notification_key uuid,
  notification_created_at timestamptz,
  notification_budget_day date,
  notification_attempts integer NOT NULL DEFAULT 0,
  notification_next_at timestamptz,
  notification_locked_until timestamptz,
  notification_error text,
  notified_at timestamptz,
  resend_id text
);
CREATE INDEX incident_groups_inbox ON incident_groups(status,last_seen DESC,id DESC);
CREATE INDEX incident_groups_expiry ON incident_groups(expires_at);
CREATE INDEX incident_groups_evidence_expiry ON incident_groups(evidence_expires_at);
CREATE INDEX incident_groups_pending ON incident_groups(notification_next_at) WHERE notification_status IN ('pending','failed');

CREATE TABLE incident_flows (
  id text PRIMARY KEY,
  operation_id text NOT NULL,
  user_id uuid,
  identity_verified boolean NOT NULL DEFAULT false,
  phone_key text,
  incident_id uuid REFERENCES incident_groups(id) ON DELETE SET NULL,
  stage text NOT NULL,
  running boolean NOT NULL DEFAULT false,
  progress jsonb NOT NULL DEFAULT '{}',
  last_progress_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '25 hours'
);
CREATE INDEX incident_flows_user ON incident_flows(user_id,updated_at DESC,id DESC);
CREATE INDEX incident_flows_group ON incident_flows(incident_id,user_id);
CREATE INDEX incident_flows_phone ON incident_flows(phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX incident_flows_watchdog ON incident_flows(last_progress_at) WHERE running;
CREATE INDEX incident_flows_expiry ON incident_flows(expires_at);

CREATE TABLE incident_receipts (
  id uuid PRIMARY KEY,
  owner_key text NOT NULL,
  phone_key text,
  incident_id uuid REFERENCES incident_groups(id) ON DELETE SET NULL,
  attempt_id text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '25 hours'
);
CREATE INDEX incident_receipts_attempt ON incident_receipts(incident_id,occurred_at,attempt_id);
CREATE INDEX incident_receipts_owner_group ON incident_receipts(owner_key,incident_id);
CREATE INDEX incident_receipts_phone ON incident_receipts(phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX incident_receipts_expiry ON incident_receipts(expires_at);

CREATE TABLE incident_daily_budgets (
  day date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'UTC')::date,
  sentry integer NOT NULL DEFAULT 0,
  emails integer NOT NULL DEFAULT 0,
  suppressed integer NOT NULL DEFAULT 0,
  client_dropped integer NOT NULL DEFAULT 0,
  overflow_reserved boolean NOT NULL DEFAULT false,
  cleanup_at timestamptz,
  cleanup_backlog integer NOT NULL DEFAULT 0,
  sweep_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours'
);
CREATE INDEX incident_daily_budgets_expiry ON incident_daily_budgets(expires_at);

ALTER TABLE incident_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_daily_budgets ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION incident_cleanup(p_limit integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=least(greatest(p_limit,1),1000); backlog integer; removed integer:=0; count_deleted integer;
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  DELETE FROM incident_receipts WHERE id IN (SELECT id FROM incident_receipts WHERE expires_at<=now() ORDER BY expires_at LIMIT n);
  GET DIAGNOSTICS count_deleted=ROW_COUNT; removed:=removed+count_deleted;
  DELETE FROM incident_flows WHERE id IN (SELECT id FROM incident_flows WHERE expires_at<=now() ORDER BY expires_at LIMIT n);
  GET DIAGNOSTICS count_deleted=ROW_COUNT; removed:=removed+count_deleted;
  DELETE FROM incident_groups WHERE id IN (SELECT id FROM incident_groups WHERE expires_at<=now() ORDER BY expires_at LIMIT n);
  GET DIAGNOSTICS count_deleted=ROW_COUNT; removed:=removed+count_deleted;
  UPDATE incident_groups SET examples='[]', notification_payload=NULL,
    notification_status=CASE WHEN notification_status IN ('pending','failed','sending') THEN 'expired' ELSE notification_status END
    WHERE id IN (SELECT id FROM incident_groups WHERE evidence_expires_at<=now() AND examples<>'[]' ORDER BY evidence_expires_at LIMIT n)
      ;
  DELETE FROM incident_daily_budgets WHERE expires_at<=now();
  SELECT (SELECT count(*) FROM incident_receipts WHERE expires_at<=now())+
    (SELECT count(*) FROM incident_flows WHERE expires_at<=now())+
    (SELECT count(*) FROM incident_groups WHERE expires_at<=now()) INTO backlog;
  INSERT INTO incident_daily_budgets(day,cleanup_at,cleanup_backlog) VALUES ((now() AT TIME ZONE 'UTC')::date,now(),backlog)
    ON CONFLICT(day) DO UPDATE SET cleanup_at=now(),cleanup_backlog=excluded.cleanup_backlog;
  RETURN jsonb_build_object('deleted',removed,'backlog',backlog);
END $$;

-- Every diagnostic JSON mutation uses this lock and capacity check. Discard
-- resolved evidence and repeated examples before sacrificing first evidence.
CREATE FUNCTION incident_fit_payload(p_extra integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE used bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  SELECT (SELECT coalesce(sum(octet_length(examples::text)+coalesce(octet_length(notification_payload::text),0)),0) FROM incident_groups)
    +(SELECT coalesce(sum(octet_length(progress::text)),0) FROM incident_flows) INTO used;
  IF used+p_extra<=20971520 THEN RETURN true; END IF;
  UPDATE incident_groups SET examples='[]',notification_payload=NULL
    WHERE status='resolved' AND notification_status NOT IN ('pending','failed','sending');
  UPDATE incident_groups SET examples=jsonb_build_array(examples->0) WHERE jsonb_array_length(examples)>1;
  SELECT (SELECT coalesce(sum(octet_length(examples::text)+coalesce(octet_length(notification_payload::text),0)),0) FROM incident_groups)
    +(SELECT coalesce(sum(octet_length(progress::text)),0) FROM incident_flows) INTO used;
  UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
  RETURN used+p_extra<=20971520;
END $$;

CREATE FUNCTION incident_freeze_notification(p_id uuid,p_key uuid,p_email jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE grouped incident_groups; snapshot jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  SELECT * INTO grouped FROM incident_groups WHERE id=p_id AND notification_key=p_key AND notification_status='sending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF grouped.notification_payload ? 'email' THEN RETURN grouped.notification_payload; END IF;
  snapshot:=grouped.notification_payload||jsonb_build_object('email',p_email);
  IF octet_length(snapshot::text)>49152 OR NOT incident_fit_payload(octet_length(snapshot::text)-octet_length(grouped.notification_payload::text)) THEN RETURN NULL; END IF;
  UPDATE incident_groups SET notification_payload=snapshot WHERE id=p_id;
  RETURN snapshot;
END $$;

CREATE FUNCTION incident_register_phone(p_key text,p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  IF p_key !~ '^[a-f0-9]{64}$' OR p_user_id IS NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM incident_flows WHERE id='phone:'||p_key AND user_id<>p_user_id) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM incident_flows WHERE id='phone:'||p_key) AND (SELECT count(*) FROM incident_flows)>=5000 THEN RETURN false; END IF;
  INSERT INTO incident_flows(id,operation_id,user_id,identity_verified,phone_key,stage)
    VALUES('phone:'||p_key,'phone:'||p_key,p_user_id,true,p_key,'waiting_for_photos') ON CONFLICT DO NOTHING;
  -- Enrich only anonymous correlation from this verified session. Preserve the
  -- original examples and immutable emails as evidence of what was known then.
  UPDATE incident_flows SET user_id=p_user_id,identity_verified=true
    WHERE phone_key=p_key AND user_id IS NULL;
  UPDATE incident_receipts SET owner_key=p_user_id::text
    WHERE phone_key=p_key AND owner_key='anonymous';
  RETURN true;
END $$;

CREATE FUNCTION incident_reserve_sentry() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE allowed boolean;
BEGIN
  INSERT INTO incident_daily_budgets(day) VALUES ((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;
  UPDATE incident_daily_budgets SET sentry=sentry+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND sentry<100 RETURNING true INTO allowed;
  RETURN coalesce(allowed,false);
END $$;

CREATE FUNCTION incident_ingest(p_event jsonb, p_user_id uuid DEFAULT NULL, p_verified boolean DEFAULT false) RETURNS jsonb
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
    SELECT count(DISTINCT attempt_id) INTO attempts FROM incident_receipts WHERE incident_receipts.incident_id=grouped.id AND occurred_at>=now()-interval '10 minutes';
    should_notify:=should_notify AND (p_verified OR kind='incident') AND (grouped.severity='blocking' OR (grouped.severity='transient' AND attempts>=3))
      AND grouped.notification_status NOT IN ('pending','failed','sending');
    IF should_notify AND incident_fit_payload(octet_length(example::text)+1024) THEN
      UPDATE incident_daily_budgets SET emails=emails+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND emails<19 RETURNING emails INTO mail_count;
      IF FOUND THEN
        UPDATE incident_groups SET notification_status='pending',notification_key=gen_random_uuid(),notification_created_at=now(),notification_budget_day=(now() AT TIME ZONE 'UTC')::date,notification_next_at=greatest(now(),grouped.notified_at+interval '1 hour'),notification_attempts=0,
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

CREATE FUNCTION incident_sweep(p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE flow incident_flows; stalled integer:=0;
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  FOR flow IN SELECT * FROM incident_flows WHERE running AND last_progress_at<now()-interval '5 minutes' ORDER BY last_progress_at LIMIT least(greatest(p_limit,1),100) FOR UPDATE LOOP
    PERFORM incident_ingest(jsonb_build_object('id',gen_random_uuid(),'event','operation_possibly_stalled','occurredAt',now(),
      'source','watchdog','release',coalesce(flow.progress->>'release','unknown'),'market',coalesce(flow.progress->>'market','unknown'),
      'fingerprint','stalled:'||flow.stage||':'||coalesce(flow.progress->>'release','unknown')||':'||coalesce(flow.progress->>'market','unknown'),
      'operationId',flow.operation_id,'definition',jsonb_build_object('kind','incident','severity','warning'),
      'context',jsonb_build_object('stage',flow.stage,'lastConfirmedStage',flow.stage,'errorCode','POSSIBLY_STALLED','message','No progress reported for five minutes. This is not a confirmed failure.')),flow.user_id,flow.identity_verified);
    UPDATE incident_flows SET running=false WHERE id=flow.id;
    stalled:=stalled+1;
  END LOOP;
  INSERT INTO incident_daily_budgets(day,sweep_at) VALUES((now() AT TIME ZONE 'UTC')::date,now()) ON CONFLICT(day) DO UPDATE SET sweep_at=now();
  RETURN jsonb_build_object('possiblyStalled',stalled);
END $$;

CREATE FUNCTION incident_claim_notifications(p_limit integer DEFAULT 10) RETURNS SETOF incident_groups
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE grouped incident_groups; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(73150030);
  INSERT INTO incident_daily_budgets(day) VALUES(today) ON CONFLICT DO NOTHING;
  UPDATE incident_groups SET notification_status='expired',notification_error='Delivery retry window expired'
    WHERE notification_status IN ('pending','failed','sending') AND notification_created_at<now()-interval '23 hours';
  FOR grouped IN SELECT * FROM incident_groups WHERE notification_status IN ('pending','failed','sending')
      AND notification_next_at<=now() AND (notification_locked_until IS NULL OR notification_locked_until<=now())
      ORDER BY notification_next_at LIMIT least(greatest(p_limit,1),20) FOR UPDATE SKIP LOCKED LOOP
    -- A reservation from yesterday cannot bypass today's cap. Retries are
    -- conservatively charged once on each delivery day, even after unknown IO.
    IF grouped.notification_budget_day IS DISTINCT FROM today THEN
      UPDATE incident_daily_budgets SET emails=emails+1 WHERE day=today AND emails<19;
      IF NOT FOUND THEN
        UPDATE incident_groups SET notification_status='suppressed',notification_error='Delivery day email budget exhausted' WHERE id=grouped.id;
        UPDATE incident_daily_budgets SET suppressed=suppressed+1 WHERE day=today;
        CONTINUE;
      END IF;
    END IF;
    UPDATE incident_groups SET notification_status='sending',notification_budget_day=today,notification_locked_until=now()+interval '2 minutes',notification_attempts=notification_attempts+1
      WHERE id=grouped.id RETURNING * INTO grouped;
    RETURN NEXT grouped;
  END LOOP;
END $$;

CREATE FUNCTION incident_list(p_user_id uuid DEFAULT NULL,p_status text DEFAULT 'open',p_before timestamptz DEFAULT NULL,p_id uuid DEFAULT NULL,p_client_id text DEFAULT NULL)
RETURNS TABLE(id uuid,event text,source text,severity text,status text,release text,market text,stage text,first_seen timestamptz,last_seen timestamptz,occurrences integer,notification_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id,g.event,g.source,g.severity,g.status,g.release,g.market,g.stage,g.first_seen,g.last_seen,g.occurrences,g.notification_status FROM incident_groups g
    WHERE g.last_seen>=now()-interval '24 hours'
      AND (p_status='all' OR (p_status='open' AND g.status IN ('open','acknowledged')) OR g.status=p_status)
      AND (p_before IS NULL OR (g.last_seen,g.id)<(p_before,p_id))
      AND (p_user_id IS NULL OR EXISTS(SELECT 1 FROM incident_receipts r WHERE r.incident_id=g.id AND r.owner_key=p_user_id::text))
      AND (p_client_id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(g.examples) example WHERE example->'context'->>'analyticsClientId'=p_client_id))
    ORDER BY g.last_seen DESC,g.id DESC LIMIT 51;
$$;

CREATE FUNCTION incident_set_state(p_id uuid,p_status text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_status NOT IN ('open','acknowledged','resolved') THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(73150030);
  UPDATE incident_groups SET status=p_status,
    resolved_at=CASE WHEN p_status='resolved' THEN now() ELSE NULL END,
    notification_status=CASE WHEN p_status='resolved' AND notification_status IN ('pending','failed') THEN 'cancelled' ELSE notification_status END,
    evidence_expires_at=CASE WHEN p_status='resolved' THEN least(evidence_expires_at,now()+interval '1 hour') ELSE evidence_expires_at END
    WHERE id=p_id;
  RETURN FOUND;
END $$;

CREATE FUNCTION incident_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('groups',(SELECT count(*) FROM incident_groups),'flows',(SELECT count(*) FROM incident_flows),
    'receipts',(SELECT count(*) FROM incident_receipts),
    'payloadBytes',(SELECT coalesce(sum(octet_length(examples::text)+coalesce(octet_length(notification_payload::text),0)),0) FROM incident_groups)+(SELECT coalesce(sum(octet_length(progress::text)),0) FROM incident_flows),
    'physicalBytes',pg_total_relation_size('incident_groups')+pg_total_relation_size('incident_flows')+pg_total_relation_size('incident_receipts')+pg_total_relation_size('incident_daily_budgets'),
    'budgets',(SELECT coalesce(jsonb_agg(b),'[]') FROM (SELECT * FROM incident_daily_budgets ORDER BY day DESC LIMIT 2) b),
    'failedNotifications',(SELECT count(*) FROM incident_groups WHERE notification_status='failed'),
    'pending',(SELECT count(*) FROM incident_groups WHERE notification_status IN ('pending','failed','sending')));
$$;

REVOKE ALL ON incident_groups,incident_flows,incident_receipts,incident_daily_budgets FROM PUBLIC,anon,authenticated;
GRANT ALL ON incident_groups,incident_flows,incident_receipts,incident_daily_budgets TO service_role;
REVOKE ALL ON FUNCTION incident_ingest(jsonb,uuid,boolean),incident_cleanup(integer),incident_reserve_sentry(),incident_register_phone(text,uuid),incident_claim_notifications(integer),incident_sweep(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION incident_ingest(jsonb,uuid,boolean),incident_cleanup(integer),incident_reserve_sentry(),incident_register_phone(text,uuid),incident_claim_notifications(integer),incident_sweep(integer) TO service_role;
REVOKE ALL ON FUNCTION incident_list(uuid,text,timestamptz,uuid,text),incident_set_state(uuid,text),incident_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION incident_list(uuid,text,timestamptz,uuid,text),incident_set_state(uuid,text),incident_health() TO service_role;

REVOKE ALL ON FUNCTION incident_fit_payload(integer),incident_freeze_notification(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION incident_fit_payload(integer),incident_freeze_notification(uuid,uuid,jsonb) TO service_role;

COMMIT;
