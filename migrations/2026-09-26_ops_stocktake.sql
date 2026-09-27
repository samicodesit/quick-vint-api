CREATE TABLE ops_stocktakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 location_id uuid NOT NULL REFERENCES ops_locations(id),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')),
 started_by uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 UNIQUE(workspace_id,id)
);
CREATE UNIQUE INDEX ops_one_open_stocktake_per_location ON ops_stocktakes(workspace_id,location_id) WHERE status='open';
CREATE TABLE ops_stocktake_expected (
 stocktake_id uuid NOT NULL REFERENCES ops_stocktakes(id),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 item_id uuid NOT NULL REFERENCES ops_items(id),
 item_version integer NOT NULL,
 PRIMARY KEY(stocktake_id,item_id)
);
CREATE TABLE ops_stocktake_observations (
 stocktake_id uuid NOT NULL REFERENCES ops_stocktakes(id),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 item_id uuid NOT NULL REFERENCES ops_items(id),
 observed_by uuid NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(stocktake_id,item_id)
);
CREATE TABLE ops_stocktake_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 stocktake_id uuid NOT NULL REFERENCES ops_stocktakes(id),
 item_id uuid NOT NULL REFERENCES ops_items(id),
 decision text NOT NULL CHECK(decision IN('accept_missing','accept_unexpected','write_off')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 1000),
 resolved_by uuid NOT NULL,
 resolved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(stocktake_id,item_id)
);
CREATE INDEX ops_stocktake_expected_lookup ON ops_stocktake_expected(workspace_id,stocktake_id);
CREATE INDEX ops_stocktake_observed_lookup ON ops_stocktake_observations(workspace_id,stocktake_id);
ALTER TABLE ops_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_stocktake_expected ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_stocktake_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_stocktake_resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_stocktakes_read ON ops_stocktakes FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_stocktake_expected_read ON ops_stocktake_expected FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_stocktake_observations_read ON ops_stocktake_observations FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_stocktake_resolutions_read ON ops_stocktake_resolutions FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
GRANT SELECT ON ops_stocktakes,ops_stocktake_expected,ops_stocktake_observations,ops_stocktake_resolutions TO authenticated;

CREATE FUNCTION ops_start_stocktake(p_workspace_id uuid,p_location_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_id uuid; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
 THEN RAISE EXCEPTION 'Stocktake denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR NOT EXISTS(SELECT 1 FROM ops_locations WHERE id=p_location_id AND workspace_id=p_workspace_id)
 THEN RAISE EXCEPTION 'Invalid stocktake location or key' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(p_location_id::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('stocktake:'||p_workspace_id::text||':'||p_location_id::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'stocktake.start' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 INSERT INTO ops_stocktakes(workspace_id,location_id,started_by) VALUES(p_workspace_id,p_location_id,v_user) RETURNING id INTO v_id;
 INSERT INTO ops_stocktake_expected(stocktake_id,workspace_id,item_id,item_version)
  SELECT v_id,p_workspace_id,id,version FROM ops_items WHERE workspace_id=p_workspace_id AND location_id=p_location_id AND custody='on_hand';
 v_result:=jsonb_build_object('stocktakeId',v_id,'status','open','expectedCount',(SELECT count(*) FROM ops_stocktake_expected WHERE stocktake_id=v_id));
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
  VALUES(p_workspace_id,p_key,v_user,'stocktake.start',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'stocktake.start',v_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_observe_stocktake(p_workspace_id uuid,p_stocktake_id uuid,p_item_code text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_item_id uuid; v_count integer; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text; v_code text:=upper(btrim(p_item_code));
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
 THEN RAISE EXCEPTION 'Stocktake observation denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(v_code) NOT BETWEEN 1 AND 160 OR NOT EXISTS(SELECT 1 FROM ops_stocktakes WHERE id=p_stocktake_id AND workspace_id=p_workspace_id AND status='open')
 THEN RAISE EXCEPTION 'Invalid observation' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(p_stocktake_id::text||':'||v_code,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'stocktake.observe' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 SELECT count(*),(min(i.id::text))::uuid INTO v_count,v_item_id FROM ops_items i WHERE i.workspace_id=p_workspace_id AND
  (i.normalized_sku=v_code OR ('AL-I:'||upper(i.id::text))=v_code OR EXISTS(SELECT 1 FROM ops_item_identifiers a WHERE a.workspace_id=p_workspace_id AND a.item_id=i.id AND a.normalized=v_code));
 IF v_count<>1 THEN RAISE EXCEPTION 'Item scan missing or ambiguous' USING ERRCODE='22023'; END IF;
 INSERT INTO ops_stocktake_observations(stocktake_id,workspace_id,item_id,observed_by)
  VALUES(p_stocktake_id,p_workspace_id,v_item_id,v_user) ON CONFLICT(stocktake_id,item_id) DO NOTHING;
 v_result:=jsonb_build_object('stocktakeId',p_stocktake_id,'itemId',v_item_id,'observed',true);
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
  VALUES(p_workspace_id,p_key,v_user,'stocktake.observe',v_hash,v_result);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_compare_stocktake(p_workspace_id uuid,p_stocktake_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_stocktake ops_stocktakes%ROWTYPE; v_rows jsonb;
BEGIN
 IF NOT ops_member_for_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Stocktake read denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_stocktake FROM ops_stocktakes WHERE id=p_stocktake_id AND workspace_id=p_workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stocktake not found' USING ERRCODE='23503'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',i.id,'code',i.display_sku,'expected',e.item_id IS NOT NULL,
  'observed',o.item_id IS NOT NULL,'snapshotVersion',e.item_version,'currentVersion',i.version,
  'currentLocationId',i.location_id,'custody',i.custody,'classification',
  CASE WHEN r.id IS NOT NULL THEN 'resolved'
   WHEN e.item_id IS NOT NULL AND o.item_id IS NOT NULL THEN 'matched'
   WHEN e.item_id IS NOT NULL AND (i.location_id IS DISTINCT FROM v_stocktake.location_id OR i.custody<>'on_hand' OR i.version<>e.item_version) THEN 'moved_or_changed'
   WHEN e.item_id IS NOT NULL THEN 'missing'
   WHEN o.item_id IS NOT NULL AND (i.location_id IS DISTINCT FROM v_stocktake.location_id OR i.custody<>'on_hand') THEN 'unexpected_elsewhere'
   ELSE 'unexpected' END)
  ORDER BY i.display_sku),'[]'::jsonb) INTO v_rows
 FROM ops_items i
 LEFT JOIN ops_stocktake_expected e ON e.item_id=i.id AND e.stocktake_id=p_stocktake_id
 LEFT JOIN ops_stocktake_observations o ON o.item_id=i.id AND o.stocktake_id=p_stocktake_id
 LEFT JOIN ops_stocktake_resolutions r ON r.item_id=i.id AND r.stocktake_id=p_stocktake_id
 WHERE e.item_id IS NOT NULL OR o.item_id IS NOT NULL;
 RETURN jsonb_build_object('stocktakeId',p_stocktake_id,'locationId',v_stocktake.location_id,'status',v_stocktake.status,'rows',v_rows);
END $$;

CREATE FUNCTION ops_resolve_stocktake(p_workspace_id uuid,p_stocktake_id uuid,p_item_id uuid,p_decision text,p_note text,p_expected_version integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_take ops_stocktakes%ROWTYPE; v_item ops_items%ROWTYPE; v_expected boolean; v_observed boolean; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager'))
 THEN RAISE EXCEPTION 'Stocktake resolution denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_decision NOT IN('accept_missing','accept_unexpected','write_off') OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 1 AND 1000
 THEN RAISE EXCEPTION 'Invalid resolution' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('take',p_stocktake_id,'item',p_item_id,'decision',p_decision,'note',p_note,'version',p_expected_version)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'stocktake.resolve' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 SELECT * INTO v_take FROM ops_stocktakes WHERE id=p_stocktake_id AND workspace_id=p_workspace_id AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stocktake not open' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_item FROM ops_items WHERE id=p_item_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR v_item.version<>p_expected_version THEN RAISE EXCEPTION 'Item changed before resolution' USING ERRCODE='40001'; END IF;
 SELECT EXISTS(SELECT 1 FROM ops_stocktake_expected WHERE stocktake_id=p_stocktake_id AND item_id=p_item_id),
  EXISTS(SELECT 1 FROM ops_stocktake_observations WHERE stocktake_id=p_stocktake_id AND item_id=p_item_id) INTO v_expected,v_observed;
 IF p_decision IN('accept_missing','write_off') THEN
  IF NOT v_expected OR v_observed OR v_item.location_id IS DISTINCT FROM v_take.location_id OR v_item.custody<>'on_hand' OR
    v_item.version<>(SELECT item_version FROM ops_stocktake_expected WHERE stocktake_id=p_stocktake_id AND item_id=p_item_id)
  THEN RAISE EXCEPTION 'Missing item changed or was observed' USING ERRCODE='40001'; END IF;
  UPDATE ops_items SET custody=CASE WHEN p_decision='write_off' THEN 'written_off' ELSE 'missing' END,version=version+1,updated_at=now() WHERE id=p_item_id;
  UPDATE ops_listings SET status='draft',approved_revision_id=NULL,version=version+1 WHERE item_id=p_item_id AND workspace_id=p_workspace_id;
 ELSIF NOT v_observed OR v_expected OR v_item.location_id IS DISTINCT FROM v_take.location_id OR v_item.custody<>'on_hand' THEN
  RAISE EXCEPTION 'Unexpected item needs location and custody review' USING ERRCODE='40001';
 END IF;
 INSERT INTO ops_stocktake_resolutions(workspace_id,stocktake_id,item_id,decision,note,resolved_by)
  VALUES(p_workspace_id,p_stocktake_id,p_item_id,p_decision,btrim(p_note),v_user);
 v_result:=jsonb_build_object('stocktakeId',p_stocktake_id,'itemId',p_item_id,'decision',p_decision);
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
  VALUES(p_workspace_id,p_key,v_user,'stocktake.resolve',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'stocktake.resolve.'||p_decision,p_item_id,v_item.version+CASE WHEN p_decision='accept_unexpected' THEN 0 ELSE 1 END);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_close_stocktake(p_workspace_id uuid,p_stocktake_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_take ops_stocktakes%ROWTYPE; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager'))
 THEN RAISE EXCEPTION 'Stocktake close denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL THEN RAISE EXCEPTION 'Close key required' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(p_stocktake_id::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'stocktake.close' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 SELECT * INTO v_take FROM ops_stocktakes WHERE id=p_stocktake_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND OR v_take.status<>'open' THEN RAISE EXCEPTION 'Stocktake not open' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM ops_stocktake_expected e JOIN ops_items i ON i.id=e.item_id
   LEFT JOIN ops_stocktake_observations o ON o.stocktake_id=e.stocktake_id AND o.item_id=e.item_id
   LEFT JOIN ops_stocktake_resolutions r ON r.stocktake_id=e.stocktake_id AND r.item_id=e.item_id
   WHERE e.stocktake_id=p_stocktake_id AND o.item_id IS NULL AND r.item_id IS NULL
     AND i.location_id=v_take.location_id AND i.custody='on_hand' AND i.version=e.item_version)
 THEN RAISE EXCEPTION 'Unresolved missing items' USING ERRCODE='22023'; END IF;
 UPDATE ops_stocktakes SET status='closed',closed_at=now() WHERE id=p_stocktake_id;
 v_result:=jsonb_build_object('stocktakeId',p_stocktake_id,'status','closed');
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
  VALUES(p_workspace_id,p_key,v_user,'stocktake.close',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'stocktake.close',p_stocktake_id,1);
 RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION ops_start_stocktake(uuid,uuid,uuid),ops_observe_stocktake(uuid,uuid,text,uuid),ops_compare_stocktake(uuid,uuid),ops_resolve_stocktake(uuid,uuid,uuid,text,text,integer,uuid),ops_close_stocktake(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_start_stocktake(uuid,uuid,uuid),ops_observe_stocktake(uuid,uuid,text,uuid),ops_compare_stocktake(uuid,uuid),ops_resolve_stocktake(uuid,uuid,uuid,text,text,integer,uuid),ops_close_stocktake(uuid,uuid,uuid) TO authenticated;
