-- Bounded item extraction. Operator entitlement and budget rows are opt-in.
ALTER TABLE ops_items ADD COLUMN capture_revision integer NOT NULL DEFAULT 0 CHECK (capture_revision>=0);
UPDATE ops_items i SET capture_revision=(SELECT count(*) FROM ops_media_assets a WHERE a.workspace_id=i.workspace_id AND a.item_id=i.id AND a.state IN ('available','retired')) + (SELECT count(*) FROM ops_capture_sessions s WHERE s.workspace_id=i.workspace_id AND s.item_id=i.id AND s.state='finished');
CREATE FUNCTION ops_bump_item_capture_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME='ops_capture_sessions' THEN
    IF NEW.state='finished' AND OLD.state<>'finished' THEN UPDATE ops_items SET capture_revision=capture_revision+1 WHERE workspace_id=NEW.workspace_id AND id=NEW.item_id; END IF;
  ELSIF NEW.state IS DISTINCT FROM OLD.state OR NEW.position IS DISTINCT FROM OLD.position THEN
    IF NEW.state IN ('available','retired') THEN UPDATE ops_items SET capture_revision=capture_revision+1 WHERE workspace_id=NEW.workspace_id AND id=NEW.item_id; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ops_capture_revision_session AFTER UPDATE ON ops_capture_sessions FOR EACH ROW EXECUTE FUNCTION ops_bump_item_capture_revision();
CREATE TRIGGER ops_capture_revision_asset AFTER UPDATE ON ops_media_assets FOR EACH ROW EXECUTE FUNCTION ops_bump_item_capture_revision();

CREATE TABLE ops_ai_entitlements (
  workspace_id uuid PRIMARY KEY REFERENCES ops_workspaces(id),
  owner_user_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('fixture','openai')),
  monthly_result_limit integer NOT NULL CHECK (monthly_result_limit BETWEEN 1 AND 100000),
  results_used integer NOT NULL DEFAULT 0,
  period_start date NOT NULL DEFAULT date_trunc('month',now())::date,
  budget_minor bigint NOT NULL CHECK (budget_minor>0),
  spent_minor bigint NOT NULL DEFAULT 0,
  reserved_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  enabled boolean NOT NULL DEFAULT false,
  configured_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,owner_user_id) REFERENCES ops_memberships(workspace_id,user_id)
);
ALTER TABLE ops_ai_entitlements ENABLE ROW LEVEL SECURITY;
-- Entitlement changes require an operator-approved migration or admin action.
CREATE POLICY ops_ai_entitlement_owner_read ON ops_ai_entitlements FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_ai_entitlements.workspace_id AND user_id=auth.uid() AND active AND role='owner'));
GRANT SELECT ON ops_ai_entitlements TO authenticated;

CREATE TABLE ops_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  item_id uuid NOT NULL,
  capture_revision integer NOT NULL CHECK (capture_revision>0),
  mode text NOT NULL CHECK (mode IN ('initial','targeted')),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  model text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  ontology_version text NOT NULL,
  fact_revision integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','manual','failed')),
  job_id uuid,
  requested_by uuid NOT NULL,
  selected_count integer NOT NULL CHECK (selected_count BETWEEN 1 AND 8),
  omitted_count integer NOT NULL DEFAULT 0 CHECK (omitted_count>=0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,item_id,fingerprint,mode),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id),
  FOREIGN KEY(workspace_id,job_id) REFERENCES ops_jobs(workspace_id,id)
);
CREATE INDEX ops_analysis_by_item ON ops_analysis_runs(workspace_id,item_id,capture_revision,created_at DESC);
CREATE TABLE ops_analysis_run_assets (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 7),
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(run_id,asset_id), UNIQUE(run_id,position),
  FOREIGN KEY(workspace_id,run_id) REFERENCES ops_analysis_runs(workspace_id,id),
  FOREIGN KEY(workspace_id,asset_id) REFERENCES ops_media_assets(workspace_id,id)
);
CREATE TABLE ops_analysis_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed','uncertain')),
  reserved_minor bigint NOT NULL CHECK (reserved_minor>=0),
  provider_response_id text,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  image_usage jsonb,
  latency_ms integer,
  cost_minor bigint,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(run_id,attempt_number),
  FOREIGN KEY(workspace_id,run_id) REFERENCES ops_analysis_runs(workspace_id,id)
);
CREATE INDEX ops_dispatch_running ON ops_analysis_dispatches(workspace_id,status,started_at) WHERE status='running';
CREATE TABLE ops_analysis_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  item_id uuid NOT NULL,
  field_name text NOT NULL CHECK (field_name IN ('brand','category','size','colour','material','condition','measurement')),
  value_text text,
  value_number numeric(12,3),
  value_unit text,
  reason text NOT NULL CHECK (reason IN ('visible','unreadable','conflicting','not_observed')),
  label_text text,
  crop jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,run_id) REFERENCES ops_analysis_runs(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE TABLE ops_analysis_evidence (
  workspace_id uuid NOT NULL,
  proposal_id uuid NOT NULL REFERENCES ops_analysis_proposals(id),
  asset_id uuid NOT NULL,
  PRIMARY KEY(proposal_id,asset_id),
  FOREIGN KEY(workspace_id,asset_id) REFERENCES ops_media_assets(workspace_id,id)
);
CREATE TABLE ops_usage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  run_id uuid NOT NULL UNIQUE REFERENCES ops_analysis_runs(id),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  image_usage jsonb,
  latency_ms integer,
  cost_minor bigint,
  currency text,
  customer_debit integer NOT NULL CHECK (customer_debit IN (0,1)),
  rate_effective_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_analysis_run_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_analysis_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_analysis_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_analysis_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_usage_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_analysis_runs_read ON ops_analysis_runs FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_analysis_assets_read ON ops_analysis_run_assets FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_analysis_proposals_read ON ops_analysis_proposals FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_analysis_evidence_read ON ops_analysis_evidence FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_usage_owner_read ON ops_usage_entries FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_usage_entries.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager')));
GRANT SELECT ON ops_analysis_runs,ops_analysis_run_assets,ops_analysis_proposals,ops_analysis_evidence,ops_usage_entries TO authenticated;

CREATE FUNCTION ops_request_analysis(p_workspace_id uuid,p_item_id uuid,p_capture_revision integer,p_mode text,p_model text,p_prompt_version text,p_schema_version text,p_ontology_version text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_item ops_items%ROWTYPE; v_ent ops_ai_entitlements%ROWTYPE; v_assets text; v_fingerprint text; v_existing ops_analysis_runs%ROWTYPE; v_id uuid; v_job uuid; v_selected integer; v_total integer; v_result jsonb; v_previous ops_command_results%ROWTYPE; v_hash text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','lister')) THEN RAISE EXCEPTION 'Analysis denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_mode NOT IN ('initial','targeted') OR length(p_model) NOT BETWEEN 1 AND 120 OR length(p_prompt_version) NOT BETWEEN 1 AND 80 OR length(p_schema_version) NOT BETWEEN 1 AND 80 OR length(p_ontology_version) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid analysis request' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('item',p_item_id,'revision',p_capture_revision,'mode',p_mode)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('analysis:'||p_workspace_id::text||':'||p_item_id::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'analysis.request' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.capture_revision<>p_capture_revision OR p_capture_revision<1 THEN RAISE EXCEPTION 'Capture revision changed' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_capture_sessions WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state='finished') THEN RAISE EXCEPTION 'Finish capture before analysis' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state IN ('pending','uploading')) THEN RAISE EXCEPTION 'Photos are still uploading' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_ent FROM ops_ai_entitlements WHERE workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND OR NOT v_ent.enabled OR v_ent.owner_user_id<>(SELECT created_by FROM ops_workspaces WHERE id=p_workspace_id) THEN RAISE EXCEPTION 'Analysis entitlement is not enabled' USING ERRCODE='42501'; END IF;
  IF v_ent.results_used>=v_ent.monthly_result_limit THEN RAISE EXCEPTION 'Analysis result allowance exhausted' USING ERRCODE='22023'; END IF;
  SELECT count(*),string_agg(verified_sha256,':' ORDER BY position,id) INTO v_total,v_assets FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state='available';
  IF v_total<1 THEN RAISE EXCEPTION 'No verified photo available' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_selected FROM (SELECT 1 FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state='available' ORDER BY position,id LIMIT 8) selected;
  v_fingerprint:=encode(digest(p_workspace_id::text||':'||p_item_id::text||':'||p_capture_revision::text||':'||v_assets||':0:'||p_model||':'||p_prompt_version||':'||p_schema_version||':'||p_ontology_version,'sha256'),'hex');
  SELECT * INTO v_existing FROM ops_analysis_runs WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND fingerprint=v_fingerprint AND mode=p_mode;
  IF FOUND THEN v_result:=jsonb_build_object('runId',v_existing.id,'jobId',v_existing.job_id,'status',v_existing.status,'selectedCount',v_existing.selected_count,'omittedCount',v_existing.omitted_count);
  ELSE
    IF (SELECT count(*) FROM ops_analysis_runs WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND capture_revision=p_capture_revision)>=2 THEN RAISE EXCEPTION 'Pass limit reached' USING ERRCODE='22023'; END IF;
    IF p_mode='targeted' AND NOT EXISTS(SELECT 1 FROM ops_analysis_runs WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND capture_revision=p_capture_revision AND mode='initial') THEN RAISE EXCEPTION 'Initial pass required' USING ERRCODE='22023'; END IF;
    INSERT INTO ops_analysis_runs(workspace_id,item_id,capture_revision,mode,fingerprint,model,prompt_version,schema_version,ontology_version,requested_by,selected_count,omitted_count)
      VALUES(p_workspace_id,p_item_id,p_capture_revision,p_mode,v_fingerprint,p_model,p_prompt_version,p_schema_version,p_ontology_version,v_user,v_selected,v_total-v_selected) RETURNING id INTO v_id;
    INSERT INTO ops_analysis_run_assets(workspace_id,run_id,asset_id,position,asset_sha256)
      SELECT p_workspace_id,v_id,id,row_number() OVER (ORDER BY position,id)-1,verified_sha256 FROM (SELECT id,position,verified_sha256 FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state='available' ORDER BY position,id LIMIT 8) assets;
    v_job:=ops_enqueue_job(p_workspace_id,'analysis.item',v_fingerprint||':'||p_mode,jsonb_build_object('runId',v_id),now());
    UPDATE ops_analysis_runs SET job_id=v_job WHERE id=v_id;
    v_result:=jsonb_build_object('runId',v_id,'jobId',v_job,'status','queued','selectedCount',v_selected,'omittedCount',v_total-v_selected);
  END IF;
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'analysis.request',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_begin_analysis_dispatch(p_run_id uuid,p_reserve_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run ops_analysis_runs%ROWTYPE; v_ent ops_ai_entitlements%ROWTYPE; v_count integer; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('analysis-dispatch-global',0));
  SELECT * INTO v_run FROM ops_analysis_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status IN ('completed','manual','failed') THEN RAISE EXCEPTION 'Run cannot dispatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_ent FROM ops_ai_entitlements WHERE workspace_id=v_run.workspace_id FOR UPDATE;
  IF NOT FOUND OR NOT v_ent.enabled OR p_reserve_minor<0 OR v_ent.spent_minor+v_ent.reserved_minor+p_reserve_minor>v_ent.budget_minor THEN RAISE EXCEPTION 'Analysis budget exhausted' USING ERRCODE='22023'; END IF;
  UPDATE ops_analysis_dispatches SET status='uncertain',finished_at=now(),error_code='LEASE_EXPIRED' WHERE status='running' AND started_at<now()-interval '5 minutes';
  SELECT count(*) INTO v_count FROM ops_analysis_dispatches d JOIN ops_analysis_runs r ON r.id=d.run_id WHERE r.workspace_id=v_run.workspace_id AND r.item_id=v_run.item_id AND r.capture_revision=v_run.capture_revision;
  IF v_count>=3 THEN RAISE EXCEPTION 'Dispatch attempt limit reached' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM ops_analysis_dispatches WHERE status='running')>=10 OR (SELECT count(*) FROM ops_analysis_dispatches WHERE workspace_id=v_run.workspace_id AND status='running')>=2 THEN RAISE EXCEPTION 'Analysis capacity busy' USING ERRCODE='40001'; END IF;
  INSERT INTO ops_analysis_dispatches(workspace_id,run_id,attempt_number,status,reserved_minor) VALUES(v_run.workspace_id,v_run.id,v_count+1,'running',p_reserve_minor) RETURNING id INTO v_id;
  UPDATE ops_ai_entitlements SET reserved_minor=reserved_minor+p_reserve_minor WHERE workspace_id=v_run.workspace_id;
  UPDATE ops_analysis_runs SET status='running' WHERE id=v_run.id;
  RETURN jsonb_build_object('dispatchId',v_id,'attempt',v_count+1,'mode',v_ent.mode);
END; $$;

CREATE FUNCTION ops_finish_analysis_dispatch(p_dispatch_id uuid,p_status text,p_usage jsonb,p_cost_minor bigint,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_dispatch ops_analysis_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO v_dispatch FROM ops_analysis_dispatches WHERE id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND OR v_dispatch.status<>'running' OR p_status NOT IN ('succeeded','failed','uncertain') THEN RAISE EXCEPTION 'Dispatch not active' USING ERRCODE='22023'; END IF;
  UPDATE ops_analysis_dispatches SET status=p_status,finished_at=now(),provider_response_id=p_usage->>'responseId',input_tokens=(p_usage->>'inputTokens')::integer,
    output_tokens=(p_usage->>'outputTokens')::integer,cached_tokens=(p_usage->>'cachedTokens')::integer,image_usage=p_usage->'imageUsage',latency_ms=(p_usage->>'latencyMs')::integer,
    cost_minor=p_cost_minor,error_code=p_error_code WHERE id=p_dispatch_id;
  UPDATE ops_ai_entitlements SET reserved_minor=reserved_minor-CASE WHEN p_status='uncertain' THEN 0 ELSE v_dispatch.reserved_minor END,
    spent_minor=spent_minor+COALESCE(p_cost_minor,0) WHERE workspace_id=v_dispatch.workspace_id;
  RETURN true;
END; $$;

CREATE FUNCTION ops_record_analysis_result(p_run_id uuid,p_dispatch_id uuid,p_proposals jsonb,p_usage jsonb,p_cost_minor bigint,p_rate_effective_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run ops_analysis_runs%ROWTYPE; v_ent ops_ai_entitlements%ROWTYPE; v_dispatch ops_analysis_dispatches%ROWTYPE; v_proposal jsonb; v_id uuid; v_asset uuid; v_customer_debit integer;
BEGIN
  SELECT * INTO v_run FROM ops_analysis_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run missing' USING ERRCODE='02000'; END IF;
  IF v_run.status='completed' THEN RETURN jsonb_build_object('runId',p_run_id,'status','completed'); END IF;
  IF v_run.status<>'running' OR jsonb_typeof(p_proposals)<>'array' OR jsonb_array_length(p_proposals)>50 THEN RAISE EXCEPTION 'Invalid analysis result' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_dispatch FROM ops_analysis_dispatches WHERE id=p_dispatch_id AND run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_dispatch.status<>'running' THEN RAISE EXCEPTION 'Dispatch not active' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_ent FROM ops_ai_entitlements WHERE workspace_id=v_run.workspace_id FOR UPDATE;
  IF v_ent.results_used>=v_ent.monthly_result_limit THEN RAISE EXCEPTION 'Result allowance exhausted' USING ERRCODE='22023'; END IF;
  FOR v_proposal IN SELECT value FROM jsonb_array_elements(p_proposals) LOOP
    IF (v_proposal->>'field') NOT IN ('brand','category','size','colour','material','condition','measurement') OR (v_proposal->>'reason') NOT IN ('visible','unreadable','conflicting','not_observed') THEN RAISE EXCEPTION 'Invalid proposal field' USING ERRCODE='22023'; END IF;
    INSERT INTO ops_analysis_proposals(workspace_id,run_id,item_id,field_name,value_text,value_number,value_unit,reason,label_text,crop)
      VALUES(v_run.workspace_id,v_run.id,v_run.item_id,v_proposal->>'field',v_proposal->>'valueText',NULLIF(v_proposal->>'valueNumber','')::numeric,v_proposal->>'valueUnit',v_proposal->>'reason',v_proposal->>'labelText',v_proposal->'crop') RETURNING id INTO v_id;
    FOR v_asset IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(v_proposal->'evidenceAssetIds','[]'::jsonb)) LOOP
      IF NOT EXISTS(SELECT 1 FROM ops_analysis_run_assets WHERE run_id=v_run.id AND asset_id=v_asset) THEN RAISE EXCEPTION 'Foreign evidence asset' USING ERRCODE='23503'; END IF;
      INSERT INTO ops_analysis_evidence(workspace_id,proposal_id,asset_id) VALUES(v_run.workspace_id,v_id,v_asset);
    END LOOP;
  END LOOP;
  v_customer_debit:=CASE WHEN v_ent.mode='fixture' THEN 0 ELSE 1 END;
  IF p_cost_minor IS NOT NULL AND p_cost_minor>v_dispatch.reserved_minor THEN RAISE EXCEPTION 'Actual cost exceeded reservation' USING ERRCODE='22023'; END IF;
  UPDATE ops_analysis_dispatches SET status='succeeded',finished_at=now(),provider_response_id=p_usage->>'responseId',input_tokens=(p_usage->>'inputTokens')::integer,
    output_tokens=(p_usage->>'outputTokens')::integer,cached_tokens=(p_usage->>'cachedTokens')::integer,image_usage=p_usage->'imageUsage',latency_ms=(p_usage->>'latencyMs')::integer,
    cost_minor=p_cost_minor WHERE id=p_dispatch_id;
  UPDATE ops_ai_entitlements SET reserved_minor=reserved_minor-v_dispatch.reserved_minor,spent_minor=spent_minor+COALESCE(p_cost_minor,0) WHERE workspace_id=v_run.workspace_id;
  INSERT INTO ops_usage_entries(workspace_id,run_id,provider,model,input_tokens,output_tokens,cached_tokens,image_usage,latency_ms,cost_minor,currency,customer_debit,rate_effective_date)
    VALUES(v_run.workspace_id,v_run.id,CASE WHEN v_ent.mode='fixture' THEN 'fixture' ELSE 'openai' END,v_run.model,(p_usage->>'inputTokens')::integer,(p_usage->>'outputTokens')::integer,(p_usage->>'cachedTokens')::integer,p_usage->'imageUsage',(p_usage->>'latencyMs')::integer,p_cost_minor,v_ent.currency,v_customer_debit,p_rate_effective_date);
  UPDATE ops_ai_entitlements SET results_used=results_used+v_customer_debit WHERE workspace_id=v_run.workspace_id;
  UPDATE ops_analysis_runs SET status='completed',completed_at=now() WHERE id=v_run.id;
  RETURN jsonb_build_object('runId',v_run.id,'status','completed','proposalCount',jsonb_array_length(p_proposals));
END; $$;

REVOKE ALL ON FUNCTION ops_request_analysis(uuid,uuid,integer,text,text,text,text,text,uuid),ops_begin_analysis_dispatch(uuid,bigint),ops_finish_analysis_dispatch(uuid,text,jsonb,bigint,text),ops_record_analysis_result(uuid,uuid,jsonb,jsonb,bigint,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_request_analysis(uuid,uuid,integer,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ops_begin_analysis_dispatch(uuid,bigint),ops_finish_analysis_dispatch(uuid,text,jsonb,bigint,text),ops_record_analysis_result(uuid,uuid,jsonb,jsonb,bigint,date) TO service_role;
