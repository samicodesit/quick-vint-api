CREATE TABLE ops_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 order_id uuid NOT NULL REFERENCES ops_orders(id),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN('manual','vinted_official')),
 external_return_id text,
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','inspected','closed')),
 received_by uuid NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,external_return_id)
);
CREATE TABLE ops_return_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 return_id uuid NOT NULL REFERENCES ops_returns(id),
 order_line_id uuid NOT NULL REFERENCES ops_order_lines(id),
 item_id uuid NOT NULL REFERENCES ops_items(id),
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','resellable','quarantine','damaged','restocked')),
 inspection_note text,
 inspected_by uuid,
 inspected_at timestamptz,
 restocked_at timestamptz,
 restocked_location_id uuid REFERENCES ops_locations(id),
 UNIQUE(order_line_id)
);
CREATE TABLE ops_refund_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 order_id uuid NOT NULL REFERENCES ops_orders(id),
 source text NOT NULL,
 source_key text NOT NULL,
 amount_minor bigint CHECK(amount_minor>=0),
 currency text CHECK(currency ~ '^[A-Z]{3}$'),
 observed_at timestamptz NOT NULL,
 UNIQUE(workspace_id,source,source_key)
);
ALTER TABLE ops_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_refund_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_returns_read ON ops_returns FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_return_lines_read ON ops_return_lines FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_refunds_finance_read ON ops_refund_observations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_refund_observations.workspace_id AND user_id=auth.uid() AND active AND role IN('owner','manager')));
GRANT SELECT ON ops_returns,ops_return_lines,ops_refund_observations TO authenticated;

CREATE FUNCTION ops_record_return_receipt(p_workspace_id uuid,p_order_id uuid,p_item_codes jsonb,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_hash text; v_prior ops_command_results%ROWTYPE; v_return uuid; v_code text;
 v_line ops_order_lines%ROWTYPE; v_result jsonb; v_count integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
 THEN RAISE EXCEPTION 'Return receipt denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR jsonb_typeof(p_item_codes)<>'array' OR jsonb_array_length(p_item_codes) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Invalid return receipt' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('order',p_order_id,'codes',p_item_codes)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_prior.operation<>'return.receipt' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=p_order_id AND workspace_id=p_workspace_id AND status='dispatched')
 THEN RAISE EXCEPTION 'Order has not been handed over' USING ERRCODE='22023'; END IF;
 INSERT INTO ops_returns(workspace_id,order_id,received_by) VALUES(p_workspace_id,p_order_id,v_user) RETURNING id INTO v_return;
 FOR v_code IN SELECT value #>> '{}' FROM jsonb_array_elements(p_item_codes) LOOP
   SELECT l.* INTO v_line FROM ops_order_lines l JOIN ops_items i ON i.id=l.item_id
    WHERE l.order_id=p_order_id AND l.workspace_id=p_workspace_id AND
      (upper(i.display_sku)=upper(btrim(v_code)) OR 'AL-I:'||upper(i.id::text)=upper(btrim(v_code)));
   IF NOT FOUND OR EXISTS(SELECT 1 FROM ops_return_lines WHERE order_line_id=v_line.id)
   THEN RAISE EXCEPTION 'Returned garment does not match an unreturned order line' USING ERRCODE='22023'; END IF;
   IF NOT EXISTS(SELECT 1 FROM ops_items WHERE id=v_line.item_id AND custody='outbound')
   THEN RAISE EXCEPTION 'Returned garment custody changed' USING ERRCODE='40001'; END IF;
   INSERT INTO ops_return_lines(workspace_id,return_id,order_line_id,item_id) VALUES(p_workspace_id,v_return,v_line.id,v_line.item_id);
   UPDATE ops_items SET custody='return_quarantine',version=version+1,updated_at=now() WHERE id=v_line.item_id;
   v_count:=v_count+1;
 END LOOP;
 v_result:=jsonb_build_object('returnId',v_return,'receivedLines',v_count,'status','received');
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
   VALUES(p_workspace_id,p_key,v_user,'return.receipt',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'return.receipt',v_return,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_inspect_return(p_workspace_id uuid,p_return_line_id uuid,p_decision text,p_note text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_line ops_return_lines%ROWTYPE; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF p_key IS NULL OR p_decision NOT IN('resellable','quarantine','damaged') OR length(btrim(coalesce(p_note,'')))>1000
 THEN RAISE EXCEPTION 'Invalid inspection' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
 THEN RAISE EXCEPTION 'Inspection denied' USING ERRCODE='42501'; END IF;
 v_hash:=encode(digest(jsonb_build_object('line',p_return_line_id,'decision',p_decision,'note',btrim(coalesce(p_note,'')))::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_prior.actor_user_id<>v_user OR v_prior.operation<>'return.inspect' OR v_prior.payload_hash<>v_hash
   THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result;
 END IF;
 SELECT * INTO v_line FROM ops_return_lines WHERE id=p_return_line_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR v_line.status<>'received' THEN RAISE EXCEPTION 'Return line already inspected or missing' USING ERRCODE='40001'; END IF;
 UPDATE ops_return_lines SET status=p_decision,inspection_note=btrim(p_note),inspected_by=v_user,inspected_at=now() WHERE id=p_return_line_id;
 UPDATE ops_returns SET status='inspected' WHERE id=v_line.return_id;
 v_result:=jsonb_build_object('returnLineId',p_return_line_id,'status',p_decision);
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
   VALUES(p_workspace_id,p_key,v_user,'return.inspect',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'return.inspect',p_return_line_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_restock_return(p_workspace_id uuid,p_return_line_id uuid,p_location_id uuid,p_expected_item_version integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_line ops_return_lines%ROWTYPE; v_item ops_items%ROWTYPE; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF p_key IS NULL THEN RAISE EXCEPTION 'Restock key required' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager'))
 THEN RAISE EXCEPTION 'Restock approval denied' USING ERRCODE='42501'; END IF;
 v_hash:=encode(digest(jsonb_build_object('line',p_return_line_id,'location',p_location_id,'version',p_expected_item_version)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_prior.actor_user_id<>v_user OR v_prior.operation<>'return.restock' OR v_prior.payload_hash<>v_hash
   THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result;
 END IF;
 SELECT * INTO v_line FROM ops_return_lines WHERE id=p_return_line_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR v_line.status<>'resellable' THEN RAISE EXCEPTION 'Return is not cleared for restock' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_item FROM ops_items WHERE id=v_line.item_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF v_item.custody<>'return_quarantine' OR v_item.version<>p_expected_item_version
    OR (p_location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ops_locations WHERE id=p_location_id AND workspace_id=p_workspace_id))
 THEN RAISE EXCEPTION 'Item or location changed before restock' USING ERRCODE='40001'; END IF;
 UPDATE ops_items SET custody='on_hand',preparation='needs_review',location_id=p_location_id,version=version+1,updated_at=now() WHERE id=v_item.id;
 UPDATE ops_return_lines SET status='restocked',restocked_at=now(),restocked_location_id=p_location_id WHERE id=p_return_line_id;
 UPDATE ops_listings SET status='draft',approved_revision_id=NULL,version=version+1 WHERE item_id=v_item.id AND workspace_id=p_workspace_id;
 IF NOT EXISTS(SELECT 1 FROM ops_return_lines WHERE return_id=v_line.return_id AND status<>'restocked') THEN UPDATE ops_returns SET status='closed' WHERE id=v_line.return_id; END IF;
 v_result:=jsonb_build_object('returnLineId',p_return_line_id,'itemId',v_item.id,'itemVersion',v_item.version+1,'status','restocked');
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
   VALUES(p_workspace_id,p_key,v_user,'return.restock',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'return.restock',p_return_line_id,v_item.version+1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_reconcile_cancellation(p_workspace_id uuid,p_order_id uuid,p_provider_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order ops_orders%ROWTYPE; v_result jsonb;
BEGIN
 IF p_provider_status<>'CANCELED' THEN RAISE EXCEPTION 'Not a cancellation' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_order FROM ops_orders WHERE id=p_order_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='23503'; END IF;
 IF v_order.status='dispatched' THEN
   INSERT INTO ops_order_issues(workspace_id,order_id,kind,detail)
    SELECT p_workspace_id,p_order_id,'cancel_after_handover','Provider cancelled after physical handover'
    WHERE NOT EXISTS(SELECT 1 FROM ops_order_issues WHERE order_id=p_order_id AND kind='cancel_after_handover');
   UPDATE ops_orders SET raw_status='CANCELED',updated_at=now() WHERE id=p_order_id;
   RETURN jsonb_build_object('orderId',p_order_id,'status','dispatched','exception','cancel_after_handover');
 END IF;
 IF v_order.status<>'cancelled' THEN
  UPDATE ops_orders SET status='cancelled',raw_status='CANCELED',version=version+1,updated_at=now() WHERE id=p_order_id;
  UPDATE ops_reservations SET active=false,released_at=now() WHERE order_id=p_order_id AND active;
  UPDATE ops_pick_tasks SET status='cancelled',claim_id=NULL,claim_until=NULL,version=version+1 WHERE order_id=p_order_id AND status IN('pending','claimed');
  UPDATE ops_shipments SET status='cancelled' WHERE order_id=p_order_id AND status IN('preparing','ready');
 END IF;
 RETURN jsonb_build_object('orderId',p_order_id,'status','cancelled');
END $$;

REVOKE ALL ON FUNCTION ops_record_return_receipt(uuid,uuid,jsonb,uuid),ops_inspect_return(uuid,uuid,text,text,uuid),ops_restock_return(uuid,uuid,uuid,integer,uuid),ops_reconcile_cancellation(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_record_return_receipt(uuid,uuid,jsonb,uuid),ops_inspect_return(uuid,uuid,text,text,uuid),ops_restock_return(uuid,uuid,uuid,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ops_reconcile_cancellation(uuid,uuid,text) TO service_role;
