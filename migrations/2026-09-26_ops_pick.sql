CREATE TABLE ops_pick_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  mode text NOT NULL CHECK(mode IN ('single','batch')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','exception','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE ops_pick_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  wave_id uuid NOT NULL REFERENCES ops_pick_waves(id),
  order_id uuid NOT NULL REFERENCES ops_orders(id),
  line_id uuid NOT NULL REFERENCES ops_order_lines(id),
  item_id uuid NOT NULL REFERENCES ops_items(id),
  expected_location_id uuid REFERENCES ops_locations(id),
  tote_code text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','picked','missing','cancelled')),
  claim_id uuid,
  claimed_by uuid,
  claim_until timestamptz,
  version integer NOT NULL DEFAULT 1,
  picked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line_id)
);
CREATE INDEX ops_pick_tasks_wave_order ON ops_pick_tasks(wave_id,status,created_at);
CREATE INDEX ops_pick_tasks_claim ON ops_pick_tasks(workspace_id,status,claim_until);
ALTER TABLE ops_pick_waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_pick_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_pick_waves_read ON ops_pick_waves FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
CREATE POLICY ops_pick_tasks_read ON ops_pick_tasks FOR SELECT TO authenticated USING(ops_member_for_workspace(workspace_id));
GRANT SELECT ON ops_pick_waves,ops_pick_tasks TO authenticated;

CREATE FUNCTION ops_create_pick_wave(p_workspace_id uuid,p_orders jsonb,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_hash text; v_prior ops_command_results%ROWTYPE;
  v_wave uuid; v_order jsonb; v_order_id uuid; v_tote text; v_mode text; v_count integer := 0; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
    THEN RAISE EXCEPTION 'Pick wave denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR jsonb_typeof(p_orders)<>'array' OR jsonb_array_length(p_orders) NOT BETWEEN 1 AND 50
    THEN RAISE EXCEPTION 'Invalid pick wave' USING ERRCODE='22023'; END IF;
  v_mode := CASE WHEN jsonb_array_length(p_orders)=1 THEN 'single' ELSE 'batch' END;
  v_hash := encode(digest(p_orders::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':pick-wave',0));
  SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.operation<>'pick.wave.create' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_prior.result;
  END IF;
  IF (SELECT count(DISTINCT value->>'orderId') FROM jsonb_array_elements(p_orders))<>jsonb_array_length(p_orders)
    THEN RAISE EXCEPTION 'Duplicate order in wave' USING ERRCODE='22023'; END IF;
  IF v_mode='batch' AND (SELECT count(DISTINCT nullif(upper(btrim(value->>'toteCode')),'')) FROM jsonb_array_elements(p_orders))<>jsonb_array_length(p_orders)
    THEN RAISE EXCEPTION 'Batch orders need distinct tote codes' USING ERRCODE='22023'; END IF;
  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    v_order_id:=(v_order->>'orderId')::uuid;
    IF NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_order_id AND workspace_id=p_workspace_id AND status='reserved')
      OR EXISTS(SELECT 1 FROM ops_order_lines l LEFT JOIN ops_reservations r ON r.line_id=l.id AND r.active
        WHERE l.order_id=v_order_id AND (l.item_id IS NULL OR r.id IS NULL))
      OR EXISTS(SELECT 1 FROM ops_pick_tasks WHERE order_id=v_order_id AND status IN('pending','claimed','picked'))
    THEN RAISE EXCEPTION 'Order is not ready for a pick wave' USING ERRCODE='22023'; END IF;
  END LOOP;
  INSERT INTO ops_pick_waves(workspace_id,mode,created_by) VALUES(p_workspace_id,v_mode,v_user) RETURNING id INTO v_wave;
  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    v_order_id:=(v_order->>'orderId')::uuid;
    v_tote:=CASE WHEN v_mode='batch' THEN upper(btrim(v_order->>'toteCode')) ELSE NULL END;
    INSERT INTO ops_pick_tasks(workspace_id,wave_id,order_id,line_id,item_id,expected_location_id,tote_code)
      SELECT p_workspace_id,v_wave,v_order_id,l.id,l.item_id,i.location_id,v_tote FROM ops_order_lines l
      JOIN ops_items i ON i.id=l.item_id AND i.workspace_id=p_workspace_id WHERE l.order_id=v_order_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END LOOP;
  v_result:=jsonb_build_object('waveId',v_wave,'mode',v_mode,'taskCount',(SELECT count(*) FROM ops_pick_tasks WHERE wave_id=v_wave));
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'pick.wave.create',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'pick.wave.create',v_wave,1);
  RETURN v_result;
END $$;

CREATE FUNCTION ops_claim_pick_task(p_workspace_id uuid,p_task_id uuid,p_expected_version integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_task ops_pick_tasks%ROWTYPE; v_claim uuid;
  v_hash text; v_prior ops_command_results%ROWTYPE; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
    THEN RAISE EXCEPTION 'Pick claim denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Claim key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('task',p_task_id,'version',p_expected_version)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.operation<>'pick.task.claim' OR v_prior.payload_hash<>v_hash OR v_prior.actor_user_id<>v_user
      THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_task FROM ops_pick_tasks WHERE id=p_task_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_task.version<>p_expected_version OR v_task.status NOT IN('pending','claimed')
     OR (v_task.status='claimed' AND v_task.claim_until>now())
     OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_task.order_id AND status IN('reserved','picking'))
  THEN RAISE EXCEPTION 'Pick task changed or unavailable' USING ERRCODE='40001'; END IF;
  v_claim:=gen_random_uuid();
  UPDATE ops_pick_tasks SET status='claimed',claim_id=v_claim,claimed_by=v_user,claim_until=now()+interval '5 minutes',version=version+1 WHERE id=p_task_id;
  v_result:=jsonb_build_object('taskId',p_task_id,'claimId',v_claim,'version',p_expected_version+1,'expiresAt',(SELECT claim_until FROM ops_pick_tasks WHERE id=p_task_id));
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'pick.task.claim',v_hash,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION ops_verify_pick(p_workspace_id uuid,p_task_id uuid,p_claim_id uuid,p_item_code text,p_tote_code text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_task ops_pick_tasks%ROWTYPE; v_item ops_items%ROWTYPE; v_result jsonb;
  v_hash text; v_prior ops_command_results%ROWTYPE;
BEGIN
  IF p_key IS NULL THEN RAISE EXCEPTION 'Verification key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('task',p_task_id,'claim',p_claim_id,'item',upper(btrim(p_item_code)),'tote',upper(btrim(p_tote_code)))::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.operation<>'pick.task.verify' OR v_prior.payload_hash<>v_hash OR v_prior.actor_user_id<>v_user
      THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_task FROM ops_pick_tasks WHERE id=p_task_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_task.status<>'claimed' OR v_task.claim_id<>p_claim_id OR v_task.claimed_by<>v_user OR v_task.claim_until<=now()
     OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
     OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_task.order_id AND status IN('reserved','picking'))
  THEN RAISE EXCEPTION 'Pick claim expired or order changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_item FROM ops_items WHERE id=v_task.item_id AND workspace_id=p_workspace_id;
  IF upper(btrim(p_item_code)) NOT IN(upper(v_item.display_sku),'AL-I:'||upper(v_item.id::text))
    THEN RAISE EXCEPTION 'Wrong item scan' USING ERRCODE='22023'; END IF;
  IF v_task.tote_code IS NOT NULL AND upper(btrim(coalesce(p_tote_code,'')))<>v_task.tote_code
    THEN RAISE EXCEPTION 'Wrong tote scan' USING ERRCODE='22023'; END IF;
  IF v_item.custody<>'on_hand' OR NOT EXISTS(SELECT 1 FROM ops_reservations WHERE line_id=v_task.line_id AND item_id=v_task.item_id AND active)
    THEN RAISE EXCEPTION 'Item is no longer reserved' USING ERRCODE='40001'; END IF;
  UPDATE ops_pick_tasks SET status='picked',picked_at=now(),version=version+1,claim_until=NULL WHERE id=p_task_id;
  UPDATE ops_orders SET status='picking',version=version+1,updated_at=now() WHERE id=v_task.order_id AND status='reserved';
  IF NOT EXISTS(SELECT 1 FROM ops_pick_tasks WHERE wave_id=v_task.wave_id AND status<>'picked') THEN
    UPDATE ops_pick_waves SET status='completed',completed_at=now() WHERE id=v_task.wave_id;
  END IF;
  v_result:=jsonb_build_object('taskId',p_task_id,'status','picked','orderId',v_task.order_id);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'pick.task.verify',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version)
    VALUES(p_workspace_id,v_user,'pick.verify',p_task_id,v_task.version+1);
  RETURN v_result;
END $$;

CREATE FUNCTION ops_mark_pick_missing(p_workspace_id uuid,p_task_id uuid,p_claim_id uuid,p_reason text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_task ops_pick_tasks%ROWTYPE; v_hash text; v_prior ops_command_results%ROWTYPE; v_result jsonb;
BEGIN
  IF p_key IS NULL THEN RAISE EXCEPTION 'Missing-item key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('task',p_task_id,'claim',p_claim_id,'reason',btrim(p_reason))::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
  SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.operation<>'pick.task.missing' OR v_prior.payload_hash<>v_hash OR v_prior.actor_user_id<>v_user
      THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_task FROM ops_pick_tasks WHERE id=p_task_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_task.status<>'claimed' OR v_task.claim_id<>p_claim_id OR v_task.claimed_by<>v_user OR v_task.claim_until<=now()
     OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN('owner','manager','warehouse'))
     OR NOT EXISTS(SELECT 1 FROM ops_orders WHERE id=v_task.order_id AND status IN('reserved','picking'))
     OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500
  THEN RAISE EXCEPTION 'Pick exception unavailable' USING ERRCODE='40001'; END IF;
  UPDATE ops_pick_tasks SET status='missing',version=version+1,claim_until=NULL WHERE id=p_task_id;
  UPDATE ops_pick_waves SET status='exception' WHERE id=v_task.wave_id;
  INSERT INTO ops_order_issues(workspace_id,order_id,line_id,kind,detail) VALUES(p_workspace_id,v_task.order_id,v_task.line_id,'missing_pick',btrim(p_reason));
  v_result:=jsonb_build_object('taskId',p_task_id,'status','missing');
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result)
    VALUES(p_workspace_id,p_key,v_user,'pick.task.missing',v_hash,v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION ops_create_pick_wave(uuid,jsonb,uuid),ops_claim_pick_task(uuid,uuid,integer,uuid),ops_verify_pick(uuid,uuid,uuid,text,text,uuid),ops_mark_pick_missing(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_create_pick_wave(uuid,jsonb,uuid),ops_claim_pick_task(uuid,uuid,integer,uuid),ops_verify_pick(uuid,uuid,uuid,text,text,uuid),ops_mark_pick_missing(uuid,uuid,uuid,text,uuid) TO authenticated;
