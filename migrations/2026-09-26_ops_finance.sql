ALTER TABLE ops_order_lines ADD COLUMN acquisition_cost_minor bigint CHECK(acquisition_cost_minor>=0);
ALTER TABLE ops_order_lines ADD COLUMN acquisition_currency text CHECK(acquisition_currency ~ '^[A-Z]{3}$');
ALTER TABLE ops_order_lines ADD COLUMN acquisition_basis text NOT NULL DEFAULT 'unknown' CHECK(acquisition_basis IN('unknown','sale_snapshot','current_backfill'));
ALTER TABLE ops_order_lines ADD CONSTRAINT ops_line_cost_pair CHECK((acquisition_cost_minor IS NULL)=(acquisition_currency IS NULL));

CREATE FUNCTION ops_snapshot_line_cost() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_item ops_items%ROWTYPE;
BEGIN
 IF NEW.item_id IS NOT NULL THEN
  SELECT * INTO v_item FROM ops_items WHERE id=NEW.item_id AND workspace_id=NEW.workspace_id;
  NEW.acquisition_cost_minor:=v_item.cost_minor;
  NEW.acquisition_currency:=v_item.cost_currency;
  NEW.acquisition_basis:=CASE WHEN v_item.cost_minor IS NULL THEN 'unknown' ELSE 'sale_snapshot' END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ops_order_line_cost_snapshot BEFORE INSERT ON ops_order_lines FOR EACH ROW EXECUTE FUNCTION ops_snapshot_line_cost();

CREATE TABLE ops_financial_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 order_id uuid NOT NULL REFERENCES ops_orders(id),
 kind text NOT NULL CHECK(kind IN('seller_fee','shipping','packaging','refund','adjustment_credit','adjustment_debit')),
 amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 source text NOT NULL,
 source_key text NOT NULL,
 observed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,source,source_key)
);
CREATE INDEX ops_financial_order ON ops_financial_entries(workspace_id,order_id,observed_at);
ALTER TABLE ops_financial_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_financial_read ON ops_financial_entries FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_financial_entries.workspace_id AND user_id=auth.uid() AND active AND role IN('owner','manager')));
GRANT SELECT ON ops_financial_entries TO authenticated;

CREATE FUNCTION ops_record_financial_observation(p_workspace_id uuid,p_order_id uuid,p_kind text,p_amount_minor bigint,p_currency text,p_source text,p_source_key text,p_observed_at timestamptz,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_id uuid; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager'))
 THEN RAISE EXCEPTION 'Financial observation denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_kind NOT IN('seller_fee','shipping','packaging','refund','adjustment_credit','adjustment_debit') OR p_amount_minor<0 OR p_currency !~ '^[A-Z]{3}$'
  OR length(btrim(coalesce(p_source,''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_source_key,''))) NOT BETWEEN 1 AND 160 OR p_observed_at IS NULL
  OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=p_order_id AND workspace_id=p_workspace_id AND currency=p_currency)
 THEN RAISE EXCEPTION 'Invalid financial observation or currency' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('order',p_order_id,'kind',p_kind,'amount',p_amount_minor,'currency',p_currency,'source',p_source,'sourceKey',p_source_key,'observedAt',p_observed_at)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'financial.observe' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 INSERT INTO ops_financial_entries(workspace_id,order_id,kind,amount_minor,currency,source,source_key,observed_at)
  VALUES(p_workspace_id,p_order_id,p_kind,p_amount_minor,p_currency,btrim(p_source),btrim(p_source_key),p_observed_at)
  ON CONFLICT(workspace_id,source,source_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM ops_financial_entries WHERE workspace_id=p_workspace_id AND order_id=p_order_id AND kind=p_kind AND amount_minor=p_amount_minor AND currency=p_currency AND source=p_source AND source_key=p_source_key)
  THEN RAISE EXCEPTION 'Financial source key conflict' USING ERRCODE='23505'; END IF;
  SELECT id INTO v_id FROM ops_financial_entries WHERE workspace_id=p_workspace_id AND source=p_source AND source_key=p_source_key;
 END IF;
 v_result:=jsonb_build_object('entryId',v_id,'kind',p_kind,'duplicate',EXISTS(SELECT 1 FROM ops_command_results WHERE workspace_id=p_workspace_id AND operation='financial.observe' AND result->>'entryId'=v_id::text));
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
  VALUES(p_workspace_id,p_key,v_user,'financial.observe',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'financial.observe',v_id,1);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION ops_record_financial_observation(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_record_financial_observation(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid) TO authenticated;
