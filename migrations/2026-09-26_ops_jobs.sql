-- Durable, tenant-owned jobs. Apply to production only after separate release approval.
CREATE TABLE ops_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  requested_by uuid NOT NULL,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 80),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 160),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_until timestamptz,
  claimed_by text,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, dedupe_key),
  UNIQUE (workspace_id, id)
);
CREATE INDEX ops_jobs_claim_ready ON ops_jobs(available_at, id)
  WHERE status IN ('queued','running');

CREATE TABLE ops_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  attempt integer NOT NULL CHECK (attempt >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, job_id) REFERENCES ops_jobs(workspace_id, id)
);
CREATE INDEX ops_job_events_job_time ON ops_job_events(job_id, occurred_at);

CREATE FUNCTION ops_record_job_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.attempts IS DISTINCT FROM OLD.attempts THEN
    INSERT INTO ops_job_events(workspace_id,job_id,status,attempt)
      VALUES(NEW.workspace_id,NEW.id,NEW.status,NEW.attempts);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ops_job_event AFTER INSERT OR UPDATE ON ops_jobs
  FOR EACH ROW EXECUTE FUNCTION ops_record_job_event();

CREATE TABLE ops_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (source_kind, source_id)
);

ALTER TABLE ops_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_jobs_member_read ON ops_jobs FOR SELECT TO authenticated
  USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_exceptions_member_read ON ops_exceptions FOR SELECT TO authenticated
  USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_job_events_member_read ON ops_job_events FOR SELECT TO authenticated
  USING (ops_member_for_workspace(workspace_id));
GRANT SELECT ON ops_jobs, ops_job_events, ops_exceptions TO authenticated;

CREATE FUNCTION ops_enqueue_job(p_workspace_id uuid, p_kind text, p_dedupe_key text, p_payload jsonb, p_available_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_hash text; v_existing ops_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='28000'; END IF;
  IF NOT ops_member_for_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501'; END IF;
  IF p_kind IS NULL OR length(p_kind) NOT BETWEEN 1 AND 80 OR p_dedupe_key IS NULL OR length(p_dedupe_key) NOT BETWEEN 1 AND 160
    OR p_payload IS NULL OR octet_length(p_payload::text) > 65536 OR p_available_at IS NULL THEN
    RAISE EXCEPTION 'Invalid job' USING ERRCODE='22023';
  END IF;
  v_hash := encode(digest(p_payload::text, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_kind || ':' || p_dedupe_key, 0));
  SELECT * INTO v_existing FROM ops_jobs WHERE workspace_id=p_workspace_id AND kind=p_kind AND dedupe_key=p_dedupe_key;
  IF FOUND THEN
    IF v_existing.payload_hash <> v_hash THEN RAISE EXCEPTION 'Job dedupe key reused with changed payload' USING ERRCODE='23505'; END IF;
    RETURN v_existing.id;
  END IF;
  INSERT INTO ops_jobs(workspace_id,requested_by,kind,dedupe_key,payload,payload_hash,available_at)
    VALUES(p_workspace_id,auth.uid(),p_kind,p_dedupe_key,p_payload,v_hash,p_available_at) RETURNING id INTO v_id;
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,auth.uid(),'job.enqueue',v_id,1);
  RETURN v_id;
END; $$;

CREATE FUNCTION ops_enqueue_job_service(p_actor_user_id uuid, p_workspace_id uuid, p_kind text, p_dedupe_key text, p_payload jsonb, p_available_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'Actor required' USING ERRCODE='22023'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  RETURN ops_enqueue_job(p_workspace_id,p_kind,p_dedupe_key,p_payload,p_available_at);
END; $$;

CREATE FUNCTION ops_claim_jobs(p_worker_id text, p_limit integer, p_lease_seconds integer)
RETURNS SETOF ops_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 80 OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Invalid claim parameters' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  UPDATE ops_jobs j SET status='running', claimed_by=p_worker_id,
    lease_until=now() + make_interval(secs => p_lease_seconds), attempts=j.attempts+1, updated_at=now()
  FROM (
    SELECT id FROM ops_jobs
    WHERE ((status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now()))
      AND attempts<max_attempts
    ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) claim WHERE j.id=claim.id RETURNING j.*;
END; $$;

CREATE FUNCTION ops_finish_job(p_id uuid, p_worker_id text, p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job ops_jobs%ROWTYPE;
BEGIN
  UPDATE ops_jobs SET status='succeeded', result=p_result, lease_until=NULL, claimed_by=NULL, updated_at=now()
    WHERE id=p_id AND status='running' AND claimed_by=p_worker_id AND lease_until>now()
    RETURNING * INTO v_job;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job claim expired or changed' USING ERRCODE='40001'; END IF;
  INSERT INTO ops_audit_events(workspace_id,actor_service,action,aggregate_id,aggregate_version)
    VALUES(v_job.workspace_id,p_worker_id,'job.succeed',v_job.id,v_job.attempts);
  RETURN true;
END; $$;

CREATE FUNCTION ops_fail_job(p_id uuid, p_worker_id text, p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job ops_jobs%ROWTYPE;
BEGIN
  UPDATE ops_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,
    available_at=CASE WHEN attempts>=max_attempts THEN available_at ELSE now()+make_interval(secs => power(2, attempts)::integer) END,
    last_error=left(p_error,500), lease_until=NULL, claimed_by=NULL, updated_at=now()
    WHERE id=p_id AND status='running' AND claimed_by=p_worker_id AND lease_until>now()
    RETURNING * INTO v_job;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job claim expired or changed' USING ERRCODE='40001'; END IF;
  IF v_job.status='failed' THEN
    INSERT INTO ops_exceptions(workspace_id,source_kind,source_id,message)
      VALUES(v_job.workspace_id,'job',v_job.id,'Job exhausted retry budget')
      ON CONFLICT (source_kind,source_id) DO NOTHING;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION ops_job_metrics() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'queued', count(*) FILTER (WHERE status='queued'),
    'running', count(*) FILTER (WHERE status='running'),
    'succeeded', count(*) FILTER (WHERE status='succeeded'),
    'failed', count(*) FILTER (WHERE status='failed')
  ) FROM ops_jobs;
$$;

REVOKE ALL ON FUNCTION ops_enqueue_job(uuid,text,text,jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_enqueue_job(uuid,text,text,jsonb,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION ops_enqueue_job_service(uuid,uuid,text,text,jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_enqueue_job_service(uuid,uuid,text,text,jsonb,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION ops_claim_jobs(text,integer,integer), ops_finish_job(uuid,text,jsonb), ops_fail_job(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_claim_jobs(text,integer,integer), ops_finish_job(uuid,text,jsonb), ops_fail_job(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION ops_job_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_job_metrics() TO service_role;
