-- Durable capture metadata. Apply to production only after an approved release.
CREATE TABLE ops_capture_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  item_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','finished')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id)
);
CREATE INDEX ops_capture_by_item ON ops_capture_sessions(workspace_id,item_id,created_at DESC);
CREATE TABLE ops_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  item_id uuid NOT NULL,
  session_id uuid NOT NULL,
  client_file_id text NOT NULL CHECK (length(client_file_id) BETWEEN 1 AND 120),
  original_name text NOT NULL,
  declared_mime text NOT NULL,
  detected_mime text,
  declared_bytes bigint NOT NULL CHECK (declared_bytes BETWEEN 1 AND 20971520),
  actual_bytes bigint,
  declared_sha256 text NOT NULL CHECK (declared_sha256 ~ '^[a-f0-9]{64}$'),
  verified_sha256 text,
  original_path text NOT NULL,
  derivative_path text,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','uploading','available','failed','retired')),
  error_code text,
  retired_at timestamptz,
  retired_by uuid,
  creator_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE(workspace_id,id),
  UNIQUE(session_id,client_file_id),
  UNIQUE(original_path),
  FOREIGN KEY(workspace_id,item_id) REFERENCES ops_items(workspace_id,id),
  FOREIGN KEY(workspace_id,session_id) REFERENCES ops_capture_sessions(workspace_id,id)
);
CREATE INDEX ops_media_item_order ON ops_media_assets(workspace_id,item_id,position,id);
CREATE TABLE ops_capture_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
  session_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  grant_hash text UNIQUE CHECK (grant_hash ~ '^[a-f0-9]{64}$'),
  grant_expires_at timestamptz,
  created_by uuid NOT NULL,
  FOREIGN KEY(workspace_id,session_id) REFERENCES ops_capture_sessions(workspace_id,id)
);
CREATE TABLE ops_media_quotas (
  workspace_id uuid PRIMARY KEY REFERENCES ops_workspaces(id),
  max_bytes bigint NOT NULL DEFAULT 2147483648 CHECK (max_bytes > 0)
);
ALTER TABLE ops_capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_capture_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_media_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_capture_read ON ops_capture_sessions FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_media_read ON ops_media_assets FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
CREATE POLICY ops_quota_read ON ops_media_quotas FOR SELECT TO authenticated USING (ops_member_for_workspace(workspace_id));
GRANT SELECT ON ops_capture_sessions,ops_media_assets,ops_media_quotas TO authenticated;

CREATE FUNCTION ops_create_capture_session(p_workspace_id uuid,p_item_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_previous ops_command_results%ROWTYPE; v_hash text; v_id uuid; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','warehouse','lister')) THEN RAISE EXCEPTION 'Capture denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(p_item_id::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'capture.create' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_items WHERE workspace_id=p_workspace_id AND id=p_item_id) THEN RAISE EXCEPTION 'Item missing' USING ERRCODE='23503'; END IF;
  INSERT INTO ops_capture_sessions(workspace_id,item_id,owner_user_id) VALUES(p_workspace_id,p_item_id,v_user) RETURNING id INTO v_id;
  v_result:=jsonb_build_object('sessionId',v_id,'itemId',p_item_id,'revision',1);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'capture.create',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'capture.create',v_id,1);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_create_upload_manifest(p_workspace_id uuid,p_session_id uuid,p_files jsonb,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_session ops_capture_sessions%ROWTYPE; v_file jsonb; v_asset uuid; v_path text; v_rows jsonb:='[]'::jsonb; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb; v_count integer; v_bytes bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','warehouse','lister')) THEN RAISE EXCEPTION 'Manifest denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR jsonb_typeof(p_files)<>'array' OR jsonb_array_length(p_files)<1 OR jsonb_array_length(p_files)>200 THEN RAISE EXCEPTION 'Invalid manifest' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('session',p_session_id,'files',p_files)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'capture.manifest' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_session FROM ops_capture_sessions WHERE workspace_id=p_workspace_id AND id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.state<>'open' THEN RAISE EXCEPTION 'Capture session is closed or missing' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('media-quota:'||p_workspace_id::text,0));
  SELECT count(*),COALESCE(sum(declared_bytes),0) INTO v_count,v_bytes FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=v_session.item_id AND state NOT IN ('failed','retired');
  IF v_count+jsonb_array_length(p_files)>20 THEN RAISE EXCEPTION 'Photo limit exceeded' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM ops_media_assets WHERE session_id=p_session_id AND state IN ('pending','uploading'))+jsonb_array_length(p_files)>200 THEN RAISE EXCEPTION 'Pending file limit exceeded' USING ERRCODE='22023'; END IF;
  FOR v_file IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    IF length(COALESCE(v_file->>'clientFileId','')) NOT BETWEEN 1 AND 120
       OR length(COALESCE(v_file->>'name','')) NOT BETWEEN 1 AND 255
       OR (v_file->>'mime') NOT IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')
       OR COALESCE(v_file->>'sha256','') !~ '^[a-f0-9]{64}$'
       OR COALESCE(v_file->>'bytes','') !~ '^[0-9]+$'
       OR (v_file->>'bytes')::bigint NOT BETWEEN 1 AND 20971520
       THEN RAISE EXCEPTION 'Invalid photo metadata' USING ERRCODE='22023'; END IF;
    v_asset:=gen_random_uuid(); v_path:=p_workspace_id::text||'/'||v_session.item_id::text||'/'||v_asset::text;
    INSERT INTO ops_media_assets(id,workspace_id,item_id,session_id,client_file_id,original_name,declared_mime,declared_bytes,declared_sha256,original_path,position,creator_user_id)
      VALUES(v_asset,p_workspace_id,v_session.item_id,p_session_id,v_file->>'clientFileId',v_file->>'name',v_file->>'mime',(v_file->>'bytes')::bigint,v_file->>'sha256',v_path,v_count,v_user);
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('uploadId',v_asset,'itemId',v_session.item_id,'path',v_path,'state','pending'));
    v_count:=v_count+1; v_bytes:=v_bytes+(v_file->>'bytes')::bigint;
  END LOOP;
  IF (SELECT COALESCE(sum(declared_bytes),0) FROM ops_media_assets WHERE workspace_id=p_workspace_id AND state NOT IN ('failed','retired')) > COALESCE((SELECT max_bytes FROM ops_media_quotas WHERE workspace_id=p_workspace_id),2147483648) THEN RAISE EXCEPTION 'Workspace media quota exceeded' USING ERRCODE='22023'; END IF;
  v_result:=jsonb_build_object('uploads',v_rows,'sessionId',p_session_id,'itemId',v_session.item_id);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'capture.manifest',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_finish_capture(p_workspace_id uuid,p_session_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_session ops_capture_sessions%ROWTYPE; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','warehouse','lister')) THEN RAISE EXCEPTION 'Finish denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(p_session_id::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'capture.finish' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_session FROM ops_capture_sessions WHERE workspace_id=p_workspace_id AND id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capture missing' USING ERRCODE='02000'; END IF;
  IF v_session.state='open' THEN UPDATE ops_capture_sessions SET state='finished',finished_at=now(),revision=revision+1 WHERE id=p_session_id RETURNING * INTO v_session; END IF;
  v_result:=jsonb_build_object('sessionId',p_session_id,'itemId',v_session.item_id,'revision',v_session.revision,'pendingUploads',(SELECT count(*) FROM ops_media_assets WHERE session_id=p_session_id AND state IN ('pending','uploading')));
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'capture.finish',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'capture.finish',p_session_id,v_session.revision);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_create_capture_pairing(p_workspace_id uuid,p_session_id uuid,p_token_hash text,p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_id uuid;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_expires_at<=now() OR p_expires_at>now()+interval '10 minutes' THEN RAISE EXCEPTION 'Invalid pairing' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','warehouse','lister')) THEN RAISE EXCEPTION 'Pairing denied' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_capture_sessions WHERE workspace_id=p_workspace_id AND id=p_session_id AND state='open') THEN RAISE EXCEPTION 'Capture closed' USING ERRCODE='22023'; END IF;
  INSERT INTO ops_capture_pairings(workspace_id,session_id,token_hash,expires_at,created_by) VALUES(p_workspace_id,p_session_id,p_token_hash,p_expires_at,v_user) RETURNING id INTO v_id;
  RETURN jsonb_build_object('pairingId',v_id,'expiresAt',p_expires_at);
END; $$;

CREATE FUNCTION ops_redeem_capture_pairing(p_token_hash text,p_grant_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_pair ops_capture_pairings%ROWTYPE; v_item uuid;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_grant_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid token' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_pair FROM ops_capture_pairings WHERE token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_pair.used_at IS NOT NULL OR v_pair.expires_at<=now() THEN RAISE EXCEPTION 'Pairing expired or used' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=v_pair.workspace_id AND user_id=v_pair.created_by AND active) THEN RAISE EXCEPTION 'Pairing owner no longer authorised' USING ERRCODE='42501'; END IF;
  SELECT item_id INTO v_item FROM ops_capture_sessions WHERE workspace_id=v_pair.workspace_id AND id=v_pair.session_id AND state='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Capture closed' USING ERRCODE='22023'; END IF;
  UPDATE ops_capture_pairings SET used_at=now(),grant_hash=p_grant_hash,grant_expires_at=now()+interval '4 hours' WHERE id=v_pair.id;
  RETURN jsonb_build_object('workspaceId',v_pair.workspace_id,'sessionId',v_pair.session_id,'itemId',v_item,'scope','upload');
END; $$;

CREATE FUNCTION ops_pairing_upload_manifest(p_grant_hash text,p_files jsonb,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_pair ops_capture_pairings%ROWTYPE; v_previous_claim text; v_result jsonb;
BEGIN
  SELECT * INTO v_pair FROM ops_capture_pairings WHERE grant_hash=p_grant_hash AND grant_expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload grant expired' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=v_pair.workspace_id AND user_id=v_pair.created_by AND active) THEN RAISE EXCEPTION 'Pairing owner no longer authorised' USING ERRCODE='42501'; END IF;
  v_previous_claim:=current_setting('request.jwt.claim.sub',true);
  PERFORM set_config('request.jwt.claim.sub',v_pair.created_by::text,true);
  v_result:=ops_create_upload_manifest(v_pair.workspace_id,v_pair.session_id,p_files,p_key);
  PERFORM set_config('request.jwt.claim.sub',COALESCE(v_previous_claim,''),true);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_complete_upload(p_workspace_id uuid,p_upload_id uuid,p_sha256 text,p_actual_bytes bigint,p_mime text,p_derivative_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_asset ops_media_assets%ROWTYPE;
BEGIN
  -- EXECUTE is granted only to service_role; the browser cannot attest to bytes.
  SELECT * INTO v_asset FROM ops_media_assets WHERE workspace_id=p_workspace_id AND id=p_upload_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload missing' USING ERRCODE='02000'; END IF;
  IF v_asset.state='retired' THEN RAISE EXCEPTION 'Photo was retired' USING ERRCODE='22023'; END IF;
  IF v_asset.state='available' THEN
    IF v_asset.verified_sha256<>p_sha256 THEN RAISE EXCEPTION 'Verified upload mismatch' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('uploadId',v_asset.id,'itemId',v_asset.item_id,'state','available');
  END IF;
  IF v_asset.declared_sha256<>p_sha256 OR v_asset.declared_bytes<>p_actual_bytes OR p_derivative_path IS NULL THEN RAISE EXCEPTION 'Photo verification failed' USING ERRCODE='22023'; END IF;
  UPDATE ops_media_assets SET state='available',actual_bytes=p_actual_bytes,detected_mime=p_mime,verified_sha256=p_sha256,derivative_path=p_derivative_path,verified_at=now(),error_code=NULL WHERE id=p_upload_id;
  RETURN jsonb_build_object('uploadId',v_asset.id,'itemId',v_asset.item_id,'state','available');
END; $$;

CREATE FUNCTION ops_reorder_media(p_workspace_id uuid,p_item_id uuid,p_ids uuid[],p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb; v_count integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','warehouse','lister')) THEN RAISE EXCEPTION 'Reorder denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid order' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(jsonb_build_object('item',p_item_id,'ids',p_ids)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'media.reorder' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT count(*) INTO v_count FROM ops_media_assets WHERE workspace_id=p_workspace_id AND item_id=p_item_id AND state='available';
  IF v_count<>cardinality(p_ids) OR (SELECT count(DISTINCT requested.id) FROM unnest(p_ids) AS requested(id))<>v_count
     OR EXISTS(SELECT 1 FROM unnest(p_ids) AS requested(id) LEFT JOIN ops_media_assets a ON a.id=requested.id AND a.workspace_id=p_workspace_id AND a.item_id=p_item_id AND a.state='available' WHERE a.id IS NULL)
     THEN RAISE EXCEPTION 'Order must include every available photo once' USING ERRCODE='22023'; END IF;
  UPDATE ops_media_assets a SET position=x.ordinality-1 FROM unnest(p_ids) WITH ORDINALITY x(id,ordinality) WHERE a.id=x.id AND a.workspace_id=p_workspace_id AND a.item_id=p_item_id;
  v_result:=jsonb_build_object('itemId',p_item_id,'orderedIds',p_ids);
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'media.reorder',v_hash,v_result);
  RETURN v_result;
END; $$;

CREATE FUNCTION ops_retire_media(p_workspace_id uuid,p_upload_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_asset ops_media_assets%ROWTYPE; v_previous ops_command_results%ROWTYPE; v_hash text; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role IN ('owner','manager','warehouse','lister')) THEN RAISE EXCEPTION 'Retake denied' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  v_hash:=encode(digest(p_upload_id::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_key::text,0));
  SELECT * INTO v_previous FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_previous.operation<>'media.retire' OR v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO v_asset FROM ops_media_assets WHERE workspace_id=p_workspace_id AND id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR v_asset.state<>'available' THEN RAISE EXCEPTION 'Verified photo not found' USING ERRCODE='22023'; END IF;
  UPDATE ops_media_assets SET state='retired',retired_at=now(),retired_by=v_user WHERE id=p_upload_id;
  v_result:=jsonb_build_object('uploadId',p_upload_id,'itemId',v_asset.item_id,'state','retired');
  INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'media.retire',v_hash,v_result);
  INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'media.retire',p_upload_id,1);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION ops_create_capture_session(uuid,uuid,uuid),ops_create_upload_manifest(uuid,uuid,jsonb,uuid),ops_finish_capture(uuid,uuid,uuid),ops_create_capture_pairing(uuid,uuid,text,timestamptz),ops_redeem_capture_pairing(text,text),ops_pairing_upload_manifest(text,jsonb,uuid),ops_complete_upload(uuid,uuid,text,bigint,text,text),ops_reorder_media(uuid,uuid,uuid[],uuid),ops_retire_media(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_create_capture_session(uuid,uuid,uuid),ops_create_upload_manifest(uuid,uuid,jsonb,uuid),ops_finish_capture(uuid,uuid,uuid),ops_create_capture_pairing(uuid,uuid,text,timestamptz),ops_reorder_media(uuid,uuid,uuid[],uuid),ops_retire_media(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ops_redeem_capture_pairing(text,text),ops_pairing_upload_manifest(text,jsonb,uuid),ops_complete_upload(uuid,uuid,text,bigint,text,text) TO service_role;
