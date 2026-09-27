-- Manual orders are locally verified. Provider ingress remains gated by account access.
CREATE TABLE ops_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  source text NOT NULL CHECK(source IN ('manual','vinted_official')),
  channel_account_id uuid,
  external_order_id text,
  status text NOT NULL CHECK(status IN ('unpaid','confirmed','reserved','picking','packed','dispatched','cancelled','unknown')),
  raw_status text,
  provider_observed_at timestamptz,
  currency text CHECK(currency ~ '^[A-Z]{3}$'),
  seller_total_minor bigint CHECK(seller_total_minor >= 0),
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(channel_account_id,external_order_id),
  CHECK ((source='manual' AND channel_account_id IS NULL AND external_order_id IS NULL) OR (source='vinted_official' AND channel_account_id IS NOT NULL AND external_order_id IS NOT NULL))
);
CREATE INDEX ops_orders_workspace_status ON ops_orders(workspace_id,status,created_at DESC);

CREATE TABLE ops_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  order_id uuid NOT NULL,
  item_id uuid,
  external_line_id text,
  external_item_id text,
  item_code_snapshot text,
  title_snapshot text NOT NULL,
  seller_revenue_minor bigint CHECK(seller_revenue_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,order_id) REFERENCES ops_orders(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id),
  UNIQUE(order_id,item_id),
  UNIQUE(order_id,external_line_id)
);
CREATE INDEX ops_order_lines_item ON ops_order_lines(workspace_id,item_id);

CREATE TABLE ops_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  order_id uuid NOT NULL,
  line_id uuid NOT NULL REFERENCES ops_order_lines(id),
  item_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  FOREIGN KEY(workspace_id,order_id) REFERENCES ops_orders(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id),
  UNIQUE(order_id,line_id)
);
CREATE UNIQUE INDEX ops_reservations_one_active_item ON ops_reservations(workspace_id,item_id) WHERE active;

CREATE TABLE ops_order_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  order_id uuid NOT NULL REFERENCES ops_orders(id),
  line_id uuid REFERENCES ops_order_lines(id),
  kind text NOT NULL,
  detail text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ops_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_order_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_orders_read ON ops_orders FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_order_lines_read ON ops_order_lines FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_reservations_read ON ops_reservations FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_order_issues_read ON ops_order_issues FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
-- Revenue is returned by a role-filtered gateway, not exposed in direct table reads.
GRANT SELECT ON ops_orders,ops_order_lines,ops_reservations,ops_order_issues TO authenticated;
REVOKE SELECT ON ops_orders,ops_order_lines FROM authenticated;

CREATE FUNCTION ops_create_manual_order(p_workspace_id uuid,p_paid_confirmed boolean,p_currency text,p_seller_total_minor bigint,p_lines jsonb,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_role text; v_hash text; v_prior ops_command_results%ROWTYPE;
  v_order uuid; v_line jsonb; v_item ops_items%ROWTYPE; v_result jsonb; v_count integer := 0;
BEGIN
  SELECT role INTO v_role FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active;
  IF v_role NOT IN ('owner','manager','lister') OR v_role IS NULL THEN RAISE EXCEPTION 'Order creation denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
     OR (p_seller_total_minor IS NULL) <> (p_currency IS NULL)
     OR p_seller_total_minor<0 OR (p_currency IS NOT NULL AND p_currency !~ '^[A-Z]{3}$')
  THEN RAISE EXCEPTION 'Invalid manual order' USING ERRCODE='22023'; END IF;
  v_hash := encode(digest(jsonb_build_object('paid',p_paid_confirmed,'currency',p_currency,'total',p_seller_total_minor,'lines',p_lines)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.operation<>'order.manual.create' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_prior.result;
  END IF;
  INSERT INTO ops_orders(workspace_id,source,status,currency,seller_total_minor,created_by)
    VALUES(p_workspace_id,'manual',CASE WHEN p_paid_confirmed THEN 'confirmed' ELSE 'unpaid' END,p_currency,p_seller_total_minor,v_user)
    RETURNING id INTO v_order;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'itemId') IS NULL OR (v_line->>'title') IS NULL THEN RAISE EXCEPTION 'Manual order line incomplete' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=(v_line->>'itemId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found' USING ERRCODE='23503'; END IF;
    INSERT INTO ops_order_lines(workspace_id,order_id,item_id,item_code_snapshot,title_snapshot,seller_revenue_minor)
      VALUES(p_workspace_id,v_order,v_item.id,v_item.display_sku,btrim(v_line->>'title'),
             CASE WHEN v_line ? 'sellerRevenueMinor' AND v_line->>'sellerRevenueMinor' IS NOT NULL THEN (v_line->>'sellerRevenueMinor')::bigint ELSE NULL END);
    v_count := v_count+1;
  END LOOP;
  v_result := jsonb_build_object('orderId',v_order,'status',CASE WHEN p_paid_confirmed THEN 'confirmed' ELSE 'unpaid' END,'lineCount',v_count);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'order.manual.create',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'order.manual.create',v_order,1);
  RETURN v_result;
END $$;

CREATE FUNCTION ops_reserve_order(p_workspace_id uuid,p_order_id uuid,p_expected_version integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_role text; v_order ops_orders%ROWTYPE; v_line ops_order_lines%ROWTYPE;
  v_hash text; v_prior ops_command_results%ROWTYPE; v_total integer; v_result jsonb;
BEGIN
  SELECT role INTO v_role FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active;
  IF v_role NOT IN ('owner','manager','lister','warehouse') OR v_role IS NULL THEN RAISE EXCEPTION 'Reservation denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  v_hash := encode(digest(jsonb_build_object('order',p_order_id,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':reservation',0));
  SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.operation<>'order.reserve' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_order FROM ops_orders WHERE workspace_id=p_workspace_id AND id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.version<>p_expected_version THEN RAISE EXCEPTION 'Order changed' USING ERRCODE='40001'; END IF;
  IF v_order.status<>'confirmed' THEN RAISE EXCEPTION 'Only paid confirmed orders may be reserved' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_total FROM ops_order_lines WHERE workspace_id=p_workspace_id AND order_id=p_order_id;
  IF v_total=0 OR EXISTS(SELECT 1 FROM ops_order_lines WHERE workspace_id=p_workspace_id AND order_id=p_order_id AND item_id IS NULL)
  THEN RAISE EXCEPTION 'Order has unresolved lines' USING ERRCODE='22023'; END IF;
  FOR v_line IN SELECT * FROM ops_order_lines WHERE workspace_id=p_workspace_id AND order_id=p_order_id ORDER BY item_id LOOP
    IF NOT EXISTS(SELECT 1 FROM ops_items WHERE workspace_id=p_workspace_id AND id=v_line.item_id AND custody='on_hand')
       OR EXISTS(SELECT 1 FROM ops_reservations WHERE workspace_id=p_workspace_id AND item_id=v_line.item_id AND active)
    THEN RAISE EXCEPTION 'Order item unavailable for reservation' USING ERRCODE='23505'; END IF;
    INSERT INTO ops_reservations(workspace_id,order_id,line_id,item_id) VALUES(p_workspace_id,p_order_id,v_line.id,v_line.item_id);
  END LOOP;
  UPDATE ops_orders SET status='reserved',version=version+1,updated_at=now() WHERE id=p_order_id;
  v_result := jsonb_build_object('orderId',p_order_id,'status','reserved','lineCount',v_total,'version',p_expected_version+1);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'order.reserve',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'order.reserve',p_order_id,p_expected_version+1);
  RETURN v_result;
END $$;

CREATE FUNCTION ops_ingest_order(p_workspace_id uuid,p_connection_id uuid,p_external_order_id text,p_raw_status text,
  p_observed_at timestamptz,p_currency text,p_seller_total_minor bigint,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order ops_orders%ROWTYPE; v_line jsonb; v_item uuid; v_reference text; v_status text;
  v_line_id uuid; v_issue_count integer := 0; v_line_count integer := 0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_vinted_connections WHERE id=p_connection_id AND workspace_id=p_workspace_id)
     OR p_external_order_id !~ '^\d+$' OR p_raw_status IS NULL OR p_observed_at IS NULL
     OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
     OR (p_currency IS NULL) <> (p_seller_total_minor IS NULL)
  THEN RAISE EXCEPTION 'Invalid provider order snapshot' USING ERRCODE='22023'; END IF;
  v_status := CASE p_raw_status WHEN 'READY_TO_BE_SHIPPED' THEN 'confirmed' WHEN 'CREATED' THEN 'unpaid'
    WHEN 'CANCELED' THEN 'cancelled' ELSE 'unknown' END;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_connection_id::text||':'||p_external_order_id,0));
  SELECT * INTO v_order FROM ops_orders WHERE channel_account_id=p_connection_id AND external_order_id=p_external_order_id FOR UPDATE;
  IF FOUND THEN
    IF p_observed_at > v_order.provider_observed_at AND v_order.status IN ('unpaid','confirmed','unknown') THEN
      UPDATE ops_orders SET raw_status=p_raw_status,provider_observed_at=p_observed_at,
        status=CASE WHEN p_raw_status='CANCELED' THEN 'cancelled' ELSE v_status END,
        version=version+1,updated_at=now() WHERE id=v_order.id;
    END IF;
    RETURN jsonb_build_object('orderId',v_order.id,'duplicate',true,'status',(SELECT status FROM ops_orders WHERE id=v_order.id));
  END IF;
  INSERT INTO ops_orders(workspace_id,source,channel_account_id,external_order_id,status,raw_status,provider_observed_at,currency,seller_total_minor)
    VALUES(p_workspace_id,'vinted_official',p_connection_id,p_external_order_id,v_status,p_raw_status,p_observed_at,p_currency,p_seller_total_minor)
    RETURNING * INTO v_order;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'externalLineId') IS NULL OR (v_line->>'title') IS NULL THEN RAISE EXCEPTION 'Provider line incomplete' USING ERRCODE='22023'; END IF;
    v_reference := nullif(v_line->>'itemReference','');
    v_item := NULL;
    IF v_reference IS NOT NULL THEN
      SELECT p.item_id INTO v_item FROM ops_vinted_publications p
        WHERE p.connection_id=p_connection_id AND p.workspace_id=p_workspace_id AND p.reference=v_reference;
    END IF;
    INSERT INTO ops_order_lines(workspace_id,order_id,item_id,external_line_id,external_item_id,item_code_snapshot,title_snapshot)
      VALUES(p_workspace_id,v_order.id,v_item,v_line->>'externalLineId',v_line->>'externalItemId',
        (SELECT display_sku FROM ops_items WHERE id=v_item),btrim(v_line->>'title')) RETURNING id INTO v_line_id;
    v_line_count := v_line_count+1;
    IF v_item IS NULL THEN
      INSERT INTO ops_order_issues(workspace_id,order_id,line_id,kind,detail)
        VALUES(p_workspace_id,v_order.id,v_line_id,'unmapped_item',coalesce(v_reference,'No item reference'));
      v_issue_count := v_issue_count+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('orderId',v_order.id,'duplicate',false,'status',v_status,'lineCount',v_line_count,'issueCount',v_issue_count);
END $$;

REVOKE ALL ON FUNCTION ops_create_manual_order(uuid,boolean,text,bigint,jsonb,uuid),ops_reserve_order(uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_create_manual_order(uuid,boolean,text,bigint,jsonb,uuid),ops_reserve_order(uuid,uuid,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION ops_ingest_order(uuid,uuid,text,text,timestamptz,text,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_ingest_order(uuid,uuid,text,text,timestamptz,text,bigint,jsonb) TO service_role;
