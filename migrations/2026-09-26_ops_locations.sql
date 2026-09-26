-- Tenant locations and contextual item moves. Release requires separate approval.
CREATE TABLE ops_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  parent_id uuid,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  normalized_code text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  numeric_order bigint GENERATED ALWAYS AS (CASE WHEN code ~ '^[0-9]{1,18}$' THEN code::bigint ELSE NULL END) STORED,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,normalized_code),
  FOREIGN KEY(workspace_id,parent_id) REFERENCES ops_locations(workspace_id,id)
);
CREATE INDEX ops_locations_order ON ops_locations(workspace_id,parent_id,numeric_order NULLS LAST,normalized_code);
ALTER TABLE ops_items ADD COLUMN location_id uuid;
ALTER TABLE ops_items ADD CONSTRAINT ops_items_location_fk FOREIGN KEY(workspace_id,location_id) REFERENCES ops_locations(workspace_id,id);
CREATE INDEX ops_items_location_filter ON ops_items(workspace_id,location_id,created_at DESC,id DESC);
CREATE INDEX ops_items_custody_filter ON ops_items(workspace_id,custody,preparation,created_at DESC,id DESC);

CREATE TABLE ops_item_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  item_id uuid NOT NULL,
  from_location_id uuid,
  to_location_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  item_version integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id),
  FOREIGN KEY(workspace_id,from_location_id) REFERENCES ops_locations(workspace_id,id),
  FOREIGN KEY(workspace_id,to_location_id) REFERENCES ops_locations(workspace_id,id)
);
CREATE INDEX ops_movements_item_time ON ops_item_movements(workspace_id,item_id,occurred_at DESC);
ALTER TABLE ops_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_item_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_locations_member_read ON ops_locations FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_movements_member_read ON ops_item_movements FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
GRANT SELECT ON ops_locations,ops_item_movements TO authenticated;

CREATE FUNCTION ops_create_location(p_workspace_id uuid,p_parent_id uuid,p_code text,p_name text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_hash text; v_previous ops_command_results%ROWTYPE; v_id uuid; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
    THEN RAISE EXCEPTION 'Location creation not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR length(btrim(p_code)) NOT BETWEEN 1 AND 80 OR length(btrim(p_name)) NOT BETWEEN 1 AND 160
    THEN RAISE EXCEPTION 'Invalid location' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('parent',p_parent_id,'code',p_code,'name',p_name)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'location.create' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  INSERT INTO ops_locations(workspace_id,parent_id,code,normalized_code,name)
    VALUES(p_workspace_id,p_parent_id,btrim(p_code),upper(btrim(p_code)),btrim(p_name)) RETURNING id INTO v_id;
  v_result:=jsonb_build_object('locationId',v_id,'version',1);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'location.create',v_id,1);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'location.create',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_set_location_parent(p_workspace_id uuid,p_location_id uuid,p_parent_id uuid,p_key uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_previous ops_command_results%ROWTYPE; v_location ops_locations%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager'))
    THEN RAISE EXCEPTION 'Location edit not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'Invalid location edit' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('id',p_location_id,'parent',p_parent_id,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('location-tree:'||p_workspace_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'location.parent' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_location FROM ops_locations WHERE workspace_id=p_workspace_id AND id=p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found' USING ERRCODE='02000'; END IF;
  IF v_location.version<>p_expected_version THEN RAISE EXCEPTION 'Stale location version' USING ERRCODE='40001'; END IF;
  IF p_parent_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM ops_locations WHERE workspace_id=p_workspace_id AND id=p_parent_id)
      THEN RAISE EXCEPTION 'Parent not found in workspace' USING ERRCODE='23503'; END IF;
    IF EXISTS(WITH RECURSIVE descendants AS (
      SELECT id FROM ops_locations WHERE workspace_id=p_workspace_id AND id=p_location_id
      UNION ALL SELECT child.id FROM ops_locations child JOIN descendants d ON child.parent_id=d.id WHERE child.workspace_id=p_workspace_id
    ) SELECT 1 FROM descendants WHERE id=p_parent_id)
      THEN RAISE EXCEPTION 'Location cycle' USING ERRCODE='22023'; END IF;
  END IF;
  UPDATE ops_locations SET parent_id=p_parent_id,version=version+1 WHERE id=p_location_id RETURNING * INTO v_location;
  v_result:=jsonb_build_object('locationId',p_location_id,'version',v_location.version);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'location.parent',p_location_id,v_location.version);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'location.parent',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_delete_location(p_workspace_id uuid,p_location_id uuid,p_key uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_previous ops_command_results%ROWTYPE; v_location ops_locations%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager'))
    THEN RAISE EXCEPTION 'Location deletion not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'Invalid delete request' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('id',p_location_id,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'location.delete' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_location FROM ops_locations WHERE workspace_id=p_workspace_id AND id=p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found' USING ERRCODE='02000'; END IF;
  IF v_location.version<>p_expected_version THEN RAISE EXCEPTION 'Stale location version' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM ops_items WHERE workspace_id=p_workspace_id AND location_id=p_location_id)
    OR EXISTS(SELECT 1 FROM ops_locations WHERE workspace_id=p_workspace_id AND parent_id=p_location_id)
    OR EXISTS(SELECT 1 FROM ops_item_movements WHERE workspace_id=p_workspace_id AND (from_location_id=p_location_id OR to_location_id=p_location_id))
    THEN RAISE EXCEPTION 'Location is occupied or has history' USING ERRCODE='23503'; END IF;
  DELETE FROM ops_locations WHERE id=p_location_id;
  v_result:=jsonb_build_object('locationId',p_location_id,'deleted',true);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'location.delete',p_location_id,p_expected_version);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'location.delete',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_move_item(p_workspace_id uuid,p_item_id uuid,p_location_id uuid,p_key uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_previous ops_command_results%ROWTYPE; v_item ops_items%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
    THEN RAISE EXCEPTION 'Item movement not allowed' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'Invalid move request' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('item',p_item_id,'location',p_location_id,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'item.move' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_item FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE='02000'; END IF;
  IF v_item.version<>p_expected_version THEN RAISE EXCEPTION 'Stale item version' USING ERRCODE='40001'; END IF;
  IF v_item.custody<>'on_hand' THEN RAISE EXCEPTION 'Item is not available for put-away' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_locations WHERE workspace_id=p_workspace_id AND id=p_location_id)
    THEN RAISE EXCEPTION 'Location not found in workspace' USING ERRCODE='23503'; END IF;
  IF v_item.location_id IS DISTINCT FROM p_location_id THEN
    INSERT INTO ops_item_movements(workspace_id,item_id,from_location_id,to_location_id,actor_user_id,item_version)
      VALUES(p_workspace_id,p_item_id,v_item.location_id,p_location_id,v_user,v_item.version+1);
    UPDATE ops_items SET location_id=p_location_id,version=version+1,updated_at=now() WHERE id=p_item_id RETURNING * INTO v_item;
    INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
      VALUES(p_workspace_id,v_user,'item.move',p_item_id,v_item.version);
  END IF;
  v_result:=jsonb_build_object('itemId',p_item_id,'locationId',p_location_id,'version',v_item.version);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'item.move',v_hash,v_result);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION ops_create_location(uuid,uuid,text,text,uuid),ops_set_location_parent(uuid,uuid,uuid,uuid,integer),ops_delete_location(uuid,uuid,uuid,integer),ops_move_item(uuid,uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_create_location(uuid,uuid,text,text,uuid),ops_set_location_parent(uuid,uuid,uuid,uuid,integer),ops_delete_location(uuid,uuid,uuid,integer),ops_move_item(uuid,uuid,uuid,uuid,integer) TO authenticated;

CREATE INDEX ops_items_sku_prefix ON ops_items(workspace_id,normalized_sku text_pattern_ops);
CREATE INDEX ops_identifiers_prefix ON ops_item_identifiers(workspace_id,normalized text_pattern_ops);

CREATE FUNCTION ops_list_inventory(p_workspace_id uuid,p_search text,p_custody text,p_preparation text,p_location_id uuid,p_cursor_at timestamptz,p_cursor_id uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_role text; v_row record; v_count integer:=0; v_items jsonb:='[]'::jsonb; v_last jsonb:=NULL; v_more boolean:=false; v_search text:=upper(btrim(coalesce(p_search,'')));
BEGIN
  SELECT role INTO v_role FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR length(v_search)>100 OR (p_cursor_at IS NULL)<>(p_cursor_id IS NULL)
    OR (p_custody IS NOT NULL AND p_custody NOT IN ('on_hand','outbound','return_quarantine','missing','written_off'))
    OR (p_preparation IS NOT NULL AND p_preparation NOT IN ('draft','needs_prep','needs_photos','needs_review','ready'))
    THEN RAISE EXCEPTION 'Invalid inventory filter' USING ERRCODE='22023'; END IF;
  FOR v_row IN
    SELECT i.*,l.code AS location_code FROM ops_items i LEFT JOIN ops_locations l ON l.workspace_id=i.workspace_id AND l.id=i.location_id
    WHERE i.workspace_id=p_workspace_id
      AND (p_custody IS NULL OR i.custody=p_custody)
      AND (p_preparation IS NULL OR i.preparation=p_preparation)
      AND (p_location_id IS NULL OR i.location_id=p_location_id)
      AND (v_search='' OR i.normalized_sku LIKE v_search||'%' OR EXISTS(
        SELECT 1 FROM ops_item_identifiers a WHERE a.workspace_id=i.workspace_id AND a.item_id=i.id AND a.normalized LIKE v_search||'%'))
      AND (p_cursor_at IS NULL OR (i.created_at,i.id)<(p_cursor_at,p_cursor_id))
    ORDER BY i.created_at DESC,i.id DESC LIMIT p_limit+1
  LOOP
    v_count:=v_count+1;
    IF v_count>p_limit THEN v_more:=true; EXIT; END IF;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'id',v_row.id,'displaySku',v_row.display_sku,'custody',v_row.custody,'preparation',v_row.preparation,
      'locationId',v_row.location_id,'locationCode',v_row.location_code,'version',v_row.version,'createdAt',v_row.created_at)
      ||CASE WHEN v_role IN ('owner','manager') THEN jsonb_build_object('costMinor',v_row.cost_minor,'costCurrency',v_row.cost_currency) ELSE '{}'::jsonb END);
    v_last:=jsonb_build_object('createdAt',v_row.created_at,'id',v_row.id);
  END LOOP;
  RETURN jsonb_build_object('items',v_items,'nextCursor',CASE WHEN v_more THEN v_last ELSE NULL END);
END; $$;

CREATE FUNCTION ops_resolve_identifier(p_workspace_id uuid,p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_normalized text:=upper(btrim(p_code)); v_items jsonb; v_locations jsonb; v_count integer; v_kind text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active)
    THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501'; END IF;
  IF length(v_normalized) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid scan' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',i.id,'displaySku',i.display_sku,'version',i.version)),'[]'::jsonb)
    INTO v_items FROM ops_items i WHERE i.workspace_id=p_workspace_id AND
    ((v_normalized ~ '^AL-I:[0-9A-F-]{36}$' AND i.id=substring(v_normalized from 6)::uuid)
     OR i.normalized_sku=v_normalized OR EXISTS(SELECT 1 FROM ops_item_identifiers a
       WHERE a.workspace_id=p_workspace_id AND a.item_id=i.id AND a.normalized=v_normalized));
  SELECT coalesce(jsonb_agg(jsonb_build_object('locationId',l.id,'code',l.code)),'[]'::jsonb)
    INTO v_locations FROM ops_locations l WHERE l.workspace_id=p_workspace_id AND
    ((v_normalized ~ '^AL-L:[0-9A-F-]{36}$' AND l.id=substring(v_normalized from 6)::uuid)
      OR l.normalized_code=v_normalized);
  v_count:=jsonb_array_length(v_items)+jsonb_array_length(v_locations);
  v_kind:=CASE WHEN v_count=0 THEN 'not_found' WHEN v_count>1 THEN 'ambiguous'
    WHEN jsonb_array_length(v_items)=1 THEN 'item' ELSE 'location' END;
  RETURN jsonb_build_object('kind',v_kind,'items',v_items,'locations',v_locations);
END; $$;

CREATE FUNCTION ops_list_locations(p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN ops_member_for_workspace(p_workspace_id) THEN
    coalesce(jsonb_agg(jsonb_build_object('id',id,'parentId',parent_id,'code',code,'name',name,'version',version)
      ORDER BY numeric_order NULLS LAST,normalized_code),'[]'::jsonb)
    ELSE NULL END
  FROM ops_locations WHERE workspace_id=p_workspace_id;
$$;
REVOKE ALL ON FUNCTION ops_list_inventory(uuid,text,text,text,uuid,timestamptz,uuid,integer),ops_resolve_identifier(uuid,text),ops_list_locations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_list_inventory(uuid,text,text,text,uuid,timestamptz,uuid,integer),ops_resolve_identifier(uuid,text),ops_list_locations(uuid) TO authenticated;
