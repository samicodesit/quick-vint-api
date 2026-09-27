-- Physical inventory. Apply to production only after separate release approval.
ALTER TABLE ops_workspaces ADD COLUMN next_item_number bigint NOT NULL DEFAULT 1 CHECK (next_item_number > 0);
ALTER TABLE ops_audit_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE ops_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE ops_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  supplier_id uuid,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  total_cost_minor bigint CHECK (total_cost_minor >= 0),
  currency text CHECK (currency ~ '^[A-Z]{3}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, supplier_id) REFERENCES ops_suppliers(workspace_id, id),
  CHECK ((total_cost_minor IS NULL AND currency IS NULL) OR (total_cost_minor IS NOT NULL AND currency IS NOT NULL))
);

CREATE TABLE ops_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  display_sku text NOT NULL CHECK (length(btrim(display_sku)) BETWEEN 1 AND 80),
  catalog_title text CHECK (length(btrim(catalog_title)) BETWEEN 1 AND 200),
  normalized_sku text NOT NULL CHECK (length(normalized_sku) BETWEEN 1 AND 80),
  source_id uuid,
  lot_id uuid,
  custody text NOT NULL DEFAULT 'on_hand' CHECK (custody IN ('on_hand','outbound','return_quarantine','missing','written_off')),
  preparation text NOT NULL DEFAULT 'draft' CHECK (preparation IN ('draft','needs_prep','needs_photos','needs_review','ready')),
  cost_minor bigint CHECK (cost_minor >= 0),
  cost_currency text CHECK (cost_currency ~ '^[A-Z]{3}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, normalized_sku),
  FOREIGN KEY (workspace_id, source_id) REFERENCES ops_suppliers(workspace_id, id),
  FOREIGN KEY (workspace_id, lot_id) REFERENCES ops_lots(workspace_id, id),
  CHECK ((cost_minor IS NULL AND cost_currency IS NULL) OR (cost_minor IS NOT NULL AND cost_currency IS NOT NULL))
);
CREATE INDEX ops_items_workspace_created ON ops_items(workspace_id, created_at DESC, id DESC);

CREATE TABLE ops_item_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('internal_sku','seller_sku','barcode_alias','ean')),
  value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 160),
  normalized text NOT NULL CHECK (length(normalized) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, item_id) REFERENCES ops_items(workspace_id, id),
  UNIQUE (workspace_id, item_id, kind, normalized)
);
CREATE UNIQUE INDEX ops_identifiers_unique_piece_code ON ops_item_identifiers(workspace_id, normalized)
  WHERE kind IN ('internal_sku','seller_sku','barcode_alias');
CREATE INDEX ops_identifiers_lookup ON ops_item_identifiers(workspace_id, normalized);

CREATE TABLE ops_cost_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  previous_minor bigint,
  previous_currency text,
  new_minor bigint,
  new_currency text,
  reason text NOT NULL,
  item_version integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE INDEX ops_cost_corrections_item_time ON ops_cost_corrections(workspace_id,item_id,occurred_at DESC);

ALTER TABLE ops_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_item_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_cost_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_suppliers_member_read ON ops_suppliers FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_lots_member_read ON ops_lots FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_items_member_read ON ops_items FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_identifiers_member_read ON ops_item_identifiers FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_cost_corrections_finance_read ON ops_cost_corrections FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM ops_memberships WHERE workspace_id=ops_cost_corrections.workspace_id AND user_id=auth.uid() AND active AND role IN ('owner','manager'))
);
GRANT SELECT ON ops_suppliers, ops_lots, ops_items, ops_item_identifiers TO authenticated;
GRANT SELECT ON ops_cost_corrections TO authenticated;
-- Operational cost columns must never be exposed through the generic user table API.
REVOKE SELECT ON ops_lots, ops_items FROM authenticated;

CREATE FUNCTION ops_create_item(p_workspace_id uuid, p_existing_sku text, p_source_id uuid, p_lot_id uuid, p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_role text; v_hash text; v_previous ops_command_results%ROWTYPE;
  v_sku text; v_number bigint; v_item uuid; v_result jsonb;
BEGIN
  SELECT role INTO v_role FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','lister') THEN RAISE EXCEPTION 'Intake not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR (p_existing_sku IS NOT NULL AND length(btrim(p_existing_sku)) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'Invalid item request' USING ERRCODE='22023'; END IF;
  v_hash := encode(digest(jsonb_build_object('sku',p_existing_sku,'source',p_source_id,'lot',p_lot_id)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'item.create' OR v_previous.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  IF p_existing_sku IS NULL THEN
    LOOP
      UPDATE ops_workspaces SET next_item_number=next_item_number+1 WHERE id=p_workspace_id
        RETURNING next_item_number-1 INTO v_number;
      v_sku := 'AL-' || lpad(v_number::text,greatest(6,length(v_number::text)),'0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM ops_items WHERE workspace_id=p_workspace_id AND normalized_sku=upper(v_sku));
    END LOOP;
  ELSE v_sku := btrim(p_existing_sku); END IF;
  INSERT INTO ops_items(workspace_id,display_sku,normalized_sku,source_id,lot_id,created_by)
    VALUES(p_workspace_id,v_sku,upper(v_sku),p_source_id,p_lot_id,v_user) RETURNING id INTO v_item;
  INSERT INTO ops_item_identifiers(workspace_id,item_id,kind,value,normalized)
    VALUES(p_workspace_id,v_item,CASE WHEN p_existing_sku IS NULL THEN 'internal_sku' ELSE 'seller_sku' END,v_sku,upper(v_sku));
  v_result := jsonb_build_object('itemId',v_item,'displaySku',v_sku,'version',1);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'item.create',v_item,1);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'item.create',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_add_identifier(p_workspace_id uuid, p_item_id uuid, p_kind text, p_value text, p_key uuid, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_role text; v_item ops_items%ROWTYPE; v_hash text;
  v_previous ops_command_results%ROWTYPE; v_result jsonb; v_normalized text;
BEGIN
  SELECT role INTO v_role FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','lister') THEN RAISE EXCEPTION 'Identifier edit not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_kind NOT IN ('seller_sku','barcode_alias','ean') OR length(btrim(p_value)) NOT BETWEEN 1 AND 160 OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Invalid identifier request' USING ERRCODE='22023'; END IF;
  v_normalized := upper(btrim(p_value));
  v_hash := encode(digest(jsonb_build_object('item',p_item_id,'kind',p_kind,'value',v_normalized,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'identifier.add' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE='02000'; END IF;
  IF v_item.version<>p_expected_version THEN RAISE EXCEPTION 'Stale item version' USING ERRCODE='40001'; END IF;
  INSERT INTO ops_item_identifiers(workspace_id,item_id,kind,value,normalized)
    VALUES(p_workspace_id,p_item_id,p_kind,btrim(p_value),v_normalized)
    ON CONFLICT (workspace_id,item_id,kind,normalized) DO NOTHING;
  UPDATE ops_items SET version=version+1,updated_at=now() WHERE id=p_item_id RETURNING * INTO v_item;
  v_result := jsonb_build_object('itemId',p_item_id,'version',v_item.version);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'identifier.add',p_item_id,v_item.version);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'identifier.add',v_hash,v_result);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION ops_create_item(uuid,text,uuid,uuid,uuid), ops_add_identifier(uuid,uuid,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_create_item(uuid,text,uuid,uuid,uuid), ops_add_identifier(uuid,uuid,text,text,uuid,integer) TO authenticated;

CREATE FUNCTION ops_create_lot(p_workspace_id uuid, p_name text, p_total_cost_minor bigint, p_currency text, p_supplier_id uuid, p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_hash text; v_previous ops_command_results%ROWTYPE; v_lot uuid; v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','lister'))
    THEN RAISE EXCEPTION 'Lot creation not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_total_cost_minor < 0
    OR ((p_total_cost_minor IS NULL) <> (p_currency IS NULL)) OR (p_currency IS NOT NULL AND p_currency !~ '^[A-Z]{3}$')
    THEN RAISE EXCEPTION 'Invalid lot request' USING ERRCODE='22023'; END IF;
  v_hash := encode(digest(jsonb_build_object('name',p_name,'cost',p_total_cost_minor,'currency',p_currency,'supplier',p_supplier_id)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'lot.create' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  INSERT INTO ops_lots(workspace_id,supplier_id,name,total_cost_minor,currency)
    VALUES(p_workspace_id,p_supplier_id,btrim(p_name),p_total_cost_minor,p_currency) RETURNING id INTO v_lot;
  v_result := jsonb_build_object('lotId',v_lot,'version',1);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'lot.create',v_lot,1);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'lot.create',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_allocate_lot_cost(p_workspace_id uuid, p_lot_id uuid, p_overrides jsonb, p_key uuid, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_lot ops_lots%ROWTYPE; v_previous ops_command_results%ROWTYPE;
  v_hash text; v_ids uuid[]; v_count integer; v_fixed bigint := 0; v_remaining bigint;
  v_base bigint; v_extra bigint; v_index integer := 0; v_id uuid; v_cost bigint; v_costs jsonb := '{}'::jsonb; v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager'))
    THEN RAISE EXCEPTION 'Lot allocation not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_expected_version IS NULL OR jsonb_typeof(p_overrides)<>'object'
    THEN RAISE EXCEPTION 'Invalid allocation request' USING ERRCODE='22023'; END IF;
  v_hash := encode(digest(jsonb_build_object('lot',p_lot_id,'overrides',p_overrides,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'lot.allocate' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_lot FROM ops_lots WHERE workspace_id=p_workspace_id AND id=p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found' USING ERRCODE='02000'; END IF;
  IF v_lot.version<>p_expected_version THEN RAISE EXCEPTION 'Stale lot version' USING ERRCODE='40001'; END IF;
  SELECT array_agg(id ORDER BY id), count(*) INTO v_ids,v_count FROM ops_items WHERE workspace_id=p_workspace_id AND lot_id=p_lot_id;
  IF v_count=0 THEN RAISE EXCEPTION 'Lot has no items' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_overrides) e WHERE e.key !~ '^[0-9a-f-]{36}$'
    OR NOT (e.key::uuid = ANY(v_ids)) OR jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$')
    THEN RAISE EXCEPTION 'Invalid cost override' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(sum(value::text::bigint),0) INTO v_fixed FROM jsonb_each(p_overrides);
  IF v_lot.total_cost_minor IS NULL AND p_overrides<>'{}'::jsonb
    THEN RAISE EXCEPTION 'Unknown lot cost cannot have overrides' USING ERRCODE='22023'; END IF;
  IF v_lot.total_cost_minor IS NOT NULL THEN
    IF v_fixed>v_lot.total_cost_minor THEN RAISE EXCEPTION 'Overrides exceed lot cost' USING ERRCODE='22023'; END IF;
    v_remaining := v_lot.total_cost_minor-v_fixed;
    SELECT count(*) INTO v_count FROM unnest(v_ids) id WHERE NOT p_overrides ? id::text;
    IF v_count=0 AND v_remaining<>0 THEN RAISE EXCEPTION 'Unallocated lot cost' USING ERRCODE='22023'; END IF;
    v_base := CASE WHEN v_count>0 THEN v_remaining/v_count ELSE 0 END;
    v_extra := CASE WHEN v_count>0 THEN v_remaining%v_count ELSE 0 END;
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    IF p_overrides ? v_id::text THEN v_cost := (p_overrides->>v_id::text)::bigint;
    ELSIF v_lot.total_cost_minor IS NULL THEN v_cost := NULL;
    ELSE v_cost := v_base + CASE WHEN v_index<v_extra THEN 1 ELSE 0 END; v_index := v_index+1; END IF;
    UPDATE ops_items SET cost_minor=v_cost,cost_currency=CASE WHEN v_cost IS NULL THEN NULL ELSE v_lot.currency END,
      version=version+1,updated_at=now() WHERE workspace_id=p_workspace_id AND id=v_id;
    v_costs := v_costs || jsonb_build_object(v_id::text,v_cost);
    INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
      SELECT p_workspace_id,v_user,'item.cost.allocate',id,version FROM ops_items WHERE id=v_id;
  END LOOP;
  UPDATE ops_lots SET version=version+1 WHERE id=p_lot_id RETURNING * INTO v_lot;
  v_result := jsonb_build_object('lotId',p_lot_id,'version',v_lot.version,'costs',v_costs);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'lot.allocate',p_lot_id,v_lot.version);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'lot.allocate',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_correct_item_cost(p_workspace_id uuid, p_item_id uuid, p_cost_minor bigint, p_currency text, p_reason text, p_key uuid, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_previous ops_command_results%ROWTYPE; v_item ops_items%ROWTYPE; v_hash text; v_result jsonb;
  v_old_cost bigint; v_old_currency text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager'))
    THEN RAISE EXCEPTION 'Cost correction not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_expected_version IS NULL OR p_cost_minor<0
    OR ((p_cost_minor IS NULL) <> (p_currency IS NULL)) OR (p_currency IS NOT NULL AND p_currency !~ '^[A-Z]{3}$')
    OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500
    THEN RAISE EXCEPTION 'Invalid cost correction' USING ERRCODE='22023'; END IF;
  v_hash := encode(digest(jsonb_build_object('item',p_item_id,'cost',p_cost_minor,'currency',p_currency,'reason',p_reason,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'item.cost.correct' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE='02000'; END IF;
  IF v_item.version<>p_expected_version THEN RAISE EXCEPTION 'Stale item version' USING ERRCODE='40001'; END IF;
  v_old_cost := v_item.cost_minor; v_old_currency := v_item.cost_currency;
  UPDATE ops_items SET cost_minor=p_cost_minor,cost_currency=p_currency,version=version+1,updated_at=now()
    WHERE id=p_item_id RETURNING * INTO v_item;
  v_result := jsonb_build_object('itemId',p_item_id,'version',v_item.version);
  INSERT INTO ops_cost_corrections(workspace_id,item_id,actor_user_id,previous_minor,previous_currency,new_minor,new_currency,reason,item_version)
    VALUES(p_workspace_id,p_item_id,v_user,v_old_cost,v_old_currency,p_cost_minor,p_currency,btrim(p_reason),v_item.version);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version,details)
    VALUES(p_workspace_id,v_user,'item.cost.correct',p_item_id,v_item.version,jsonb_build_object('reason',btrim(p_reason)));
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'item.cost.correct',v_hash,v_result);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION ops_create_lot(uuid,text,bigint,text,uuid,uuid), ops_allocate_lot_cost(uuid,uuid,jsonb,uuid,integer), ops_correct_item_cost(uuid,uuid,bigint,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_create_lot(uuid,text,bigint,text,uuid,uuid), ops_allocate_lot_cost(uuid,uuid,jsonb,uuid,integer), ops_correct_item_cost(uuid,uuid,bigint,text,text,uuid,integer) TO authenticated;
