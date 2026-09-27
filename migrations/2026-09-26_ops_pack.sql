CREATE TABLE ops_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  order_id uuid NOT NULL REFERENCES ops_orders(id),
  status text NOT NULL DEFAULT 'preparing' CHECK(status IN('preparing','ready','handed_over','cancelled')),
  label_id uuid,
  handed_over_at timestamptz,
  handed_over_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
CREATE TABLE ops_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  order_id uuid NOT NULL REFERENCES ops_orders(id),
  source text NOT NULL CHECK(source IN('manual_upload','vinted_official')),
  provider_revision text,
  storage_path text NOT NULL,
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint NOT NULL CHECK(bytes BETWEEN 8 AND 10000000),
  mime text NOT NULL DEFAULT 'application/pdf' CHECK(mime='application/pdf'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,storage_path)
);
ALTER TABLE ops_shipments ADD CONSTRAINT ops_shipments_label_fk FOREIGN KEY(workspace_id,label_id) REFERENCES ops_labels(workspace_id,id);
CREATE TABLE ops_pack_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  order_id uuid NOT NULL REFERENCES ops_orders(id),
  shipment_id uuid NOT NULL REFERENCES ops_shipments(id),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','ready','closed')),
  actor_user_id uuid NOT NULL,
  label_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
CREATE TABLE ops_pack_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  session_id uuid NOT NULL REFERENCES ops_pack_sessions(id),
  order_id uuid NOT NULL REFERENCES ops_orders(id),
  line_id uuid NOT NULL REFERENCES ops_order_lines(id),
  item_id uuid NOT NULL REFERENCES ops_items(id),
  actor_user_id uuid NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,line_id),
  UNIQUE(session_id,item_id)
);
ALTER TABLE ops_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_pack_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_pack_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_shipments_read ON ops_shipments FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_labels_read ON ops_labels FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_pack_sessions_read ON ops_pack_sessions FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_pack_scans_read ON ops_pack_scans FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
GRANT SELECT ON ops_shipments,ops_labels,ops_pack_sessions,ops_pack_scans TO authenticated;

CREATE FUNCTION ops_start_pack(p_workspace_id uuid,p_order_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_shipment uuid; v_session uuid; v_result jsonb; v_prior ops_command_results%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
   THEN RAISE EXCEPTION 'Packing denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL THEN RAISE EXCEPTION 'Pack key required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_prior.operation<>'pack.start' OR v_prior.payload_hash<>p_order_id::text THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=p_order_id AND workspace_id=p_workspace_id AND status='picking')
   OR NOT EXISTS(SELECT 1 FROM ops_order_lines WHERE order_id=p_order_id)
   OR EXISTS(SELECT 1 FROM ops_order_lines l LEFT JOIN ops_pick_tasks t ON t.line_id=l.id WHERE l.order_id=p_order_id AND (t.id IS NULL OR t.status<>'picked'))
 THEN RAISE EXCEPTION 'Order is not fully picked' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM ops_pack_sessions WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'Pack session already exists' USING ERRCODE='23505'; END IF;
 INSERT INTO ops_shipments(workspace_id,order_id) VALUES(p_workspace_id,p_order_id) RETURNING id INTO v_shipment;
 INSERT INTO ops_pack_sessions(workspace_id,order_id,shipment_id,actor_user_id) VALUES(p_workspace_id,p_order_id,v_shipment,v_user) RETURNING id INTO v_session;
 v_result:=jsonb_build_object('sessionId',v_session,'shipmentId',v_shipment,'status','open');
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
   VALUES(p_workspace_id,p_key,v_user,'pack.start',p_order_id::text,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'pack.start',v_session,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_scan_pack_item(p_workspace_id uuid,p_session_id uuid,p_item_code text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_session ops_pack_sessions%ROWTYPE; v_line ops_order_lines%ROWTYPE;
  v_hash text; v_prior ops_command_results%ROWTYPE; v_result jsonb;
BEGIN
 IF p_key IS NULL THEN RAISE EXCEPTION 'Pack scan key required' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('session',p_session_id,'code',upper(btrim(p_item_code)))::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_prior.operation<>'pack.scan' OR v_prior.payload_hash<>v_hash OR v_prior.actor_user_id<>v_user THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result;
 END IF;
 SELECT * INTO v_session FROM ops_pack_sessions WHERE id=p_session_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR v_session.status NOT IN('open','ready') OR v_session.actor_user_id<>v_user
    OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
    OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_session.order_id AND status='picking')
 THEN RAISE EXCEPTION 'Pack session unavailable' USING ERRCODE='40001'; END IF;
 SELECT l.* INTO v_line FROM ops_order_lines l JOIN ops_items i ON i.id=l.item_id
   WHERE l.order_id=v_session.order_id AND (upper(i.display_sku)=upper(btrim(p_item_code)) OR 'AL-I:'||upper(i.id::text)=upper(btrim(p_item_code)));
 IF NOT FOUND THEN RAISE EXCEPTION 'Wrong item for this order' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ops_pick_tasks WHERE line_id=v_line.id AND status='picked')
   OR EXISTS(SELECT 1 FROM ops_pack_scans WHERE session_id=p_session_id AND line_id=v_line.id)
 THEN RAISE EXCEPTION 'Item not picked or already packed' USING ERRCODE='23505'; END IF;
 INSERT INTO ops_pack_scans(workspace_id,session_id,order_id,line_id,item_id,actor_user_id)
   VALUES(p_workspace_id,p_session_id,v_session.order_id,v_line.id,v_line.item_id,v_user);
 v_result:=jsonb_build_object('sessionId',p_session_id,'itemId',v_line.item_id,'scannedCount',(SELECT count(*) FROM ops_pack_scans WHERE session_id=p_session_id));
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
   VALUES(p_workspace_id,p_key,v_user,'pack.scan',v_hash,v_result);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_attach_label(p_workspace_id uuid,p_session_id uuid,p_label_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_session ops_pack_sessions%ROWTYPE; v_result jsonb;
BEGIN
 IF p_key IS NULL THEN RAISE EXCEPTION 'Label key required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_session FROM ops_pack_sessions WHERE id=p_session_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR v_session.status='closed' OR v_session.actor_user_id<>v_user
    OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
    OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_session.order_id AND status='picking')
    OR NOT EXISTS(SELECT 1 FROM ops_labels WHERE id=p_label_id AND workspace_id=p_workspace_id AND order_id=v_session.order_id)
 THEN RAISE EXCEPTION 'Label does not match this active order' USING ERRCODE='22023'; END IF;
 IF v_session.label_id IS NOT NULL THEN
   IF v_session.label_id<>p_label_id THEN RAISE EXCEPTION 'A different label is already attached' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('sessionId',p_session_id,'shipmentId',v_session.shipment_id,'labelId',p_label_id,'status','ready');
 END IF;
 UPDATE ops_pack_sessions SET label_id=p_label_id,status='ready' WHERE id=p_session_id;
 UPDATE ops_shipments SET label_id=p_label_id,status='ready' WHERE id=v_session.shipment_id;
 v_result:=jsonb_build_object('sessionId',p_session_id,'shipmentId',v_session.shipment_id,'labelId',p_label_id,'status','ready');
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'pack.label.attach',p_session_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_record_handover(p_workspace_id uuid,p_shipment_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_shipment ops_shipments%ROWTYPE; v_session ops_pack_sessions%ROWTYPE; v_result jsonb; v_prior ops_command_results%ROWTYPE;
BEGIN
 IF p_key IS NULL THEN RAISE EXCEPTION 'Handover key required' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
 THEN RAISE EXCEPTION 'Handover denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_prior.operation<>'shipment.handover' OR v_prior.payload_hash<>p_shipment_id::text THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result;
 END IF;
 SELECT * INTO v_shipment FROM ops_shipments WHERE id=p_shipment_id AND workspace_id=p_workspace_id FOR UPDATE;
 SELECT * INTO v_session FROM ops_pack_sessions WHERE shipment_id=p_shipment_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF v_shipment.id IS NULL OR v_session.id IS NULL OR v_shipment.status<>'ready' OR v_shipment.label_id IS NULL OR v_session.status<>'ready'
    OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_shipment.order_id AND status='picking')
    OR EXISTS(SELECT 1 FROM ops_order_lines l LEFT JOIN ops_pack_scans s ON s.line_id=l.id AND s.session_id=v_session.id
      WHERE l.order_id=v_shipment.order_id AND s.id IS NULL)
 THEN RAISE EXCEPTION 'Package is incomplete or order changed' USING ERRCODE='22023'; END IF;
 UPDATE ops_shipments SET status='handed_over',handed_over_at=now(),handed_over_by=v_user WHERE id=p_shipment_id;
 UPDATE ops_pack_sessions SET status='closed' WHERE id=v_session.id;
 UPDATE ops_orders SET status='dispatched',version=version+1,updated_at=now() WHERE id=v_shipment.order_id;
 UPDATE ops_items SET custody='outbound',version=version+1,updated_at=now()
   WHERE id IN(SELECT item_id FROM ops_order_lines WHERE order_id=v_shipment.order_id);
 UPDATE ops_reservations SET active=false,released_at=now() WHERE order_id=v_shipment.order_id AND active;
 v_result:=jsonb_build_object('shipmentId',p_shipment_id,'status','handed_over');
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
   VALUES(p_workspace_id,p_key,v_user,'shipment.handover',p_shipment_id::text,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'shipment.handover',p_shipment_id,1);
 RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION ops_start_pack(uuid,uuid,uuid),ops_scan_pack_item(uuid,uuid,text,uuid),ops_attach_label(uuid,uuid,uuid,uuid),ops_record_handover(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_start_pack(uuid,uuid,uuid),ops_scan_pack_item(uuid,uuid,text,uuid),ops_attach_label(uuid,uuid,uuid,uuid),ops_record_handover(uuid,uuid,uuid) TO authenticated;
