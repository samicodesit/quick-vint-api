CREATE TABLE ops_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 320),
 role text NOT NULL CHECK(role IN('owner','manager','lister','warehouse')),
 token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 accepted_by uuid,
 revoked_at timestamptz,
 UNIQUE(workspace_id,id)
);
CREATE INDEX ops_invites_workspace ON ops_invitations(workspace_id,created_at DESC);
CREATE TABLE ops_workspace_settings (
 workspace_id uuid PRIMARY KEY REFERENCES ops_workspaces(id),
 ai_monthly_budget_minor bigint NOT NULL DEFAULT 0 CHECK(ai_monthly_budget_minor>=0),
 ai_currency text NOT NULL DEFAULT 'EUR' CHECK(ai_currency ~ '^[A-Z]{3}$'),
 media_retention_days integer NOT NULL DEFAULT 365 CHECK(media_retention_days BETWEEN 30 AND 3650),
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION ops_enforce_workspace_ai_budget() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_settings ops_workspace_settings%ROWTYPE; v_ent ops_ai_entitlements%ROWTYPE;
BEGIN
 SELECT * INTO v_settings FROM ops_workspace_settings WHERE workspace_id=NEW.workspace_id;
 IF FOUND THEN
  SELECT * INTO v_ent FROM ops_ai_entitlements WHERE workspace_id=NEW.workspace_id;
  IF v_settings.ai_currency<>v_ent.currency OR v_ent.spent_minor+v_ent.reserved_minor+NEW.reserved_minor>v_settings.ai_monthly_budget_minor
  THEN RAISE EXCEPTION 'Workspace AI budget exhausted or currency mismatched' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ops_workspace_ai_budget BEFORE INSERT ON ops_analysis_dispatches FOR EACH ROW EXECUTE FUNCTION ops_enforce_workspace_ai_budget();
CREATE TABLE ops_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 provider text NOT NULL CHECK(provider IN('vinted_pro','resend')),
 ciphertext text NOT NULL,
 key_version integer NOT NULL,
 last_verified_at timestamptz,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,provider)
);
CREATE TABLE ops_workspace_deletion_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES ops_workspaces(id),
 requested_by uuid NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN('pending_review','approved','completed','rejected')),
 reviewed_by uuid,
 reviewed_at timestamptz,
 UNIQUE(workspace_id,status)
);
CREATE TABLE ops_deletion_tombstones (
 workspace_id uuid PRIMARY KEY,
 request_id uuid NOT NULL,
 executed_at timestamptz NOT NULL DEFAULT now(),
 deleted_counts jsonb NOT NULL
);
ALTER TABLE ops_media_assets ADD COLUMN purged_at timestamptz;
ALTER TABLE ops_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_workspace_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_deletion_tombstones ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_invites_owner_read ON ops_invitations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_invitations.workspace_id AND user_id=auth.uid() AND active AND role='owner'));
CREATE POLICY ops_settings_manager_read ON ops_workspace_settings FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_workspace_settings.workspace_id AND user_id=auth.uid() AND active AND role IN('owner','manager')));
CREATE POLICY ops_deletion_owner_read ON ops_workspace_deletion_requests FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=ops_workspace_deletion_requests.workspace_id AND user_id=auth.uid() AND active AND role='owner'));
GRANT SELECT ON ops_invitations,ops_workspace_settings,ops_workspace_deletion_requests TO authenticated;
REVOKE ALL ON ops_credentials FROM PUBLIC,authenticated;

CREATE FUNCTION ops_invite_create(p_workspace_id uuid,p_email text,p_role text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_token text; v_id uuid; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text; v_email text:=lower(btrim(p_email));
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Invite denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_email)>320 OR p_role NOT IN('owner','manager','lister','warehouse') THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('email',v_email,'role',p_role)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'invite.create' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 v_token:=encode(gen_random_bytes(32),'hex');
 INSERT INTO ops_invitations(workspace_id,email,role,token_hash,created_by,expires_at)
  VALUES(p_workspace_id,v_email,p_role,encode(digest(v_token,'sha256'),'hex'),v_user,now()+interval '48 hours') RETURNING id INTO v_id;
 v_result:=jsonb_build_object('inviteId',v_id,'token',v_token,'expiresInHours',48);
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'invite.create',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'invite.create',v_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_invite_accept(p_token text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_email text:=lower(coalesce(nullif(current_setting('request.jwt.claim.email',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email')); v_invite ops_invitations%ROWTYPE; v_result jsonb;
BEGIN
 IF v_user IS NULL OR p_key IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR v_email IS NULL THEN RAISE EXCEPTION 'Invalid invite acceptance' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_invite FROM ops_invitations WHERE token_hash=encode(digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND OR v_invite.accepted_at IS NOT NULL OR v_invite.revoked_at IS NOT NULL OR v_invite.expires_at<=now() OR v_invite.email<>v_email
 THEN RAISE EXCEPTION 'Invitation invalid, expired or used' USING ERRCODE='22023'; END IF;
 INSERT INTO ops_memberships(workspace_id,user_id,role,active) VALUES(v_invite.workspace_id,v_user,v_invite.role,true)
  ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,active=true;
 UPDATE ops_invitations SET accepted_at=now(),accepted_by=v_user WHERE id=v_invite.id;
 v_result:=jsonb_build_object('workspaceId',v_invite.workspace_id,'role',v_invite.role);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(v_invite.workspace_id,v_user,'invite.accept',v_invite.id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_member_update(p_workspace_id uuid,p_target_user_id uuid,p_role text,p_active boolean,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_target ops_memberships%ROWTYPE; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Member update denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_role NOT IN('owner','manager','lister','warehouse') OR p_active IS NULL THEN RAISE EXCEPTION 'Invalid role change' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('target',p_target_user_id,'role',p_role,'active',p_active)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('owner:'||p_workspace_id::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'member.update' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 SELECT * INTO v_target FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='23503'; END IF;
 IF v_target.active AND v_target.role='owner' AND (NOT p_active OR p_role<>'owner') AND
    (SELECT count(*) FROM ops_memberships WHERE workspace_id=p_workspace_id AND active AND role='owner')<=1
 THEN RAISE EXCEPTION 'Last owner cannot be removed' USING ERRCODE='22023'; END IF;
 UPDATE ops_memberships SET role=p_role,active=p_active WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
 v_result:=jsonb_build_object('userId',p_target_user_id,'role',p_role,'active',p_active);
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'member.update',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'member.update',p_target_user_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_invite_revoke(p_workspace_id uuid,p_invite_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF p_key IS NULL OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Invite revoke denied' USING ERRCODE='42501'; END IF;
 UPDATE ops_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=p_invite_id AND workspace_id=p_workspace_id AND accepted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending invitation not found' USING ERRCODE='23503'; END IF;
 v_result:=jsonb_build_object('inviteId',p_invite_id,'revoked',true);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'invite.revoke',p_invite_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_settings_update(p_workspace_id uuid,p_budget_minor bigint,p_currency text,p_retention_days integer,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF p_key IS NULL OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Settings update denied' USING ERRCODE='42501'; END IF;
 IF p_budget_minor<0 OR p_currency !~ '^[A-Z]{3}$' OR p_retention_days NOT BETWEEN 30 AND 3650 THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023'; END IF;
 INSERT INTO ops_workspace_settings(workspace_id,ai_monthly_budget_minor,ai_currency,media_retention_days)
  VALUES(p_workspace_id,p_budget_minor,p_currency,p_retention_days)
  ON CONFLICT(workspace_id) DO UPDATE SET ai_monthly_budget_minor=excluded.ai_monthly_budget_minor,ai_currency=excluded.ai_currency,media_retention_days=excluded.media_retention_days,version=ops_workspace_settings.version+1,updated_at=now();
 v_result:=jsonb_build_object('workspaceId',p_workspace_id,'saved',true);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'settings.update',p_workspace_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_request_workspace_deletion(p_workspace_id uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_id uuid;
BEGIN
 IF p_key IS NULL OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Deletion request denied' USING ERRCODE='42501'; END IF;
 INSERT INTO ops_workspace_deletion_requests(workspace_id,requested_by) VALUES(p_workspace_id,v_user)
  ON CONFLICT(workspace_id,status) DO UPDATE SET requested_at=ops_workspace_deletion_requests.requested_at RETURNING id INTO v_id;
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'workspace.deletion.request',v_id,1);
 RETURN jsonb_build_object('requestId',v_id,'status','pending_review');
END $$;
CREATE FUNCTION ops_store_credential(p_workspace_id uuid,p_provider text,p_ciphertext text,p_key_version integer,p_secret_hash text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_id uuid; v_result jsonb; v_prior ops_command_results%ROWTYPE; v_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Credential update denied' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_provider NOT IN('vinted_pro','resend') OR p_key_version<>1 OR p_ciphertext NOT LIKE 'v1:%' OR length(p_ciphertext)>20000 OR p_secret_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid credential' USING ERRCODE='22023'; END IF;
 v_hash:=encode(digest(jsonb_build_object('provider',p_provider,'secretHash',p_secret_hash)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_key::text,0));
 SELECT * INTO v_prior FROM ops_command_results WHERE workspace_id=p_workspace_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_prior.operation<>'credential.store' OR v_prior.payload_hash<>v_hash THEN RAISE EXCEPTION 'Idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result;
 END IF;
 INSERT INTO ops_credentials(workspace_id,provider,ciphertext,key_version,last_verified_at,updated_by)
  VALUES(p_workspace_id,p_provider,p_ciphertext,p_key_version,NULL,v_user)
  ON CONFLICT(workspace_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,key_version=excluded.key_version,last_verified_at=NULL,updated_by=v_user,updated_at=now()
  RETURNING id INTO v_id;
 v_result:=jsonb_build_object('provider',p_provider,'stored',true,'verified',false);
 INSERT INTO ops_command_results(workspace_id,idempotency_key,actor_user_id,operation,payload_hash,result) VALUES(p_workspace_id,p_key,v_user,'credential.store',v_hash,v_result);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'credential.store',v_id,1);
 RETURN v_result;
END $$;
CREATE FUNCTION ops_delete_credential(p_workspace_id uuid,p_provider text,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_id uuid; v_result jsonb;
BEGIN
 IF p_key IS NULL OR NOT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id=p_workspace_id AND user_id=v_user AND active AND role='owner') THEN RAISE EXCEPTION 'Credential deletion denied' USING ERRCODE='42501'; END IF;
 DELETE FROM ops_credentials WHERE workspace_id=p_workspace_id AND provider=p_provider RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Credential not found' USING ERRCODE='23503'; END IF;
 v_result:=jsonb_build_object('provider',p_provider,'deleted',true);
 INSERT INTO ops_audit_events(workspace_id,actor_user_id,action,aggregate_id,aggregate_version) VALUES(p_workspace_id,v_user,'credential.delete',v_id,1);
 RETURN v_result;
END $$;

CREATE FUNCTION ops_execute_workspace_deletion(p_workspace_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_table record; v_count bigint; v_counts jsonb:='{}'::jsonb; v_storage_count bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ops_workspace_deletion_requests WHERE id=p_request_id AND workspace_id=p_workspace_id AND status='approved')
 THEN RAISE EXCEPTION 'Reviewed deletion request required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('delete:'||p_workspace_id::text,0));
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM storage.objects WHERE bucket_id IN (''ops-originals'',''ops-derivatives'',''ops-labels'') AND name LIKE $1'
   INTO v_storage_count USING p_workspace_id::text||'/%';
  IF v_storage_count>0 THEN RAISE EXCEPTION 'Private storage remains for workspace' USING ERRCODE='22023'; END IF;
 END IF;
 FOR v_table IN
  WITH RECURSIVE deps AS (
   SELECT 'ops_workspaces'::regclass::oid AS rel,0 AS depth,ARRAY['ops_workspaces'::regclass::oid] AS path
   UNION ALL
   SELECT c.conrelid,d.depth+1,d.path||c.conrelid FROM pg_constraint c JOIN deps d ON c.confrelid=d.rel
    JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace n ON n.oid=child.relnamespace
    WHERE c.contype='f' AND n.nspname='public' AND child.relname LIKE 'ops_%' AND NOT c.conrelid=ANY(d.path)
  )
  SELECT child.relname AS table_name,max(d.depth) AS depth FROM deps d JOIN pg_class child ON child.oid=d.rel
   WHERE child.relname<>'ops_workspaces' AND child.relname<>'ops_deletion_tombstones'
   GROUP BY child.relname ORDER BY max(d.depth) DESC,child.relname
 LOOP
  EXECUTE format('DELETE FROM public.%I WHERE workspace_id=$1',v_table.table_name) USING p_workspace_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  v_counts:=v_counts||jsonb_build_object(v_table.table_name,v_count);
 END LOOP;
 DELETE FROM ops_workspaces WHERE id=p_workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace missing' USING ERRCODE='23503'; END IF;
 INSERT INTO ops_deletion_tombstones(workspace_id,request_id,deleted_counts) VALUES(p_workspace_id,p_request_id,v_counts);
 RETURN jsonb_build_object('workspaceId',p_workspace_id,'deleted',true,'counts',v_counts);
END $$;
CREATE FUNCTION ops_list_workspace_storage(p_workspace_id uuid,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 IF p_offset<0 OR p_offset>1000000 THEN RAISE EXCEPTION 'Invalid storage cursor' USING ERRCODE='22023'; END IF;
 IF to_regclass('storage.objects') IS NULL THEN RETURN '[]'::jsonb; END IF;
 EXECUTE 'SELECT coalesce(jsonb_agg(jsonb_build_object(''bucket'',bucket_id,''path'',name)),''[]''::jsonb) FROM (SELECT bucket_id,name FROM storage.objects WHERE bucket_id IN (''ops-originals'',''ops-derivatives'',''ops-labels'') AND name LIKE $1 ORDER BY bucket_id,name LIMIT 500 OFFSET $2) s'
  INTO v_rows USING p_workspace_id::text||'/%',p_offset;
 RETURN v_rows;
END $$;
CREATE FUNCTION ops_retention_candidates(p_workspace_id uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid retention limit' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',id,'originalPath',original_path,'derivativePath',derivative_path)),'[]'::jsonb) INTO v_rows
 FROM (SELECT a.id,a.original_path,a.derivative_path FROM ops_media_assets a JOIN ops_workspace_settings s ON s.workspace_id=a.workspace_id
   WHERE a.workspace_id=p_workspace_id AND a.state IN('retired','failed') AND a.purged_at IS NULL
     AND a.created_at<now()-make_interval(days=>s.media_retention_days)
   ORDER BY a.created_at,a.id LIMIT p_limit) candidates;
 RETURN v_rows;
END $$;
CREATE FUNCTION ops_export_table_names()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(tablename ORDER BY tablename),'[]'::jsonb) FROM pg_tables
  WHERE schemaname='public' AND tablename LIKE 'ops_%';
$$;
CREATE FUNCTION ops_export_workspace_table(p_workspace_id uuid,p_table text,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_filter text; v_order text; v_rows jsonb;
BEGIN
 IF p_table !~ '^ops_[a-z0-9_]+$' OR p_offset<0 OR p_offset>1000000 OR NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=p_table)
 THEN RAISE EXCEPTION 'Invalid export request' USING ERRCODE='22023'; END IF;
 v_filter:=CASE WHEN p_table='ops_workspaces' THEN 'id' ELSE 'workspace_id' END;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name=v_filter)
 THEN RAISE EXCEPTION 'Table has no workspace boundary' USING ERRCODE='22023'; END IF;
 SELECT string_agg(format('%I',a.attname),',' ORDER BY key.ordinality) INTO v_order
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary
 JOIN unnest(i.indkey) WITH ORDINALITY AS key(attnum,ordinality) ON true
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum
 WHERE n.nspname='public' AND c.relname=p_table;
 IF v_order IS NULL THEN RAISE EXCEPTION 'Table has no stable export key' USING ERRCODE='22023'; END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE %I=$1 ORDER BY %s LIMIT 500 OFFSET $2) t',p_table,v_filter,v_order)
  INTO v_rows USING p_workspace_id,p_offset;
 IF p_table='ops_credentials' THEN SELECT coalesce(jsonb_agg(row - 'ciphertext'),'[]'::jsonb) INTO v_rows FROM jsonb_array_elements(v_rows) row; END IF;
 IF p_table='ops_invitations' THEN SELECT coalesce(jsonb_agg(row - 'token_hash'),'[]'::jsonb) INTO v_rows FROM jsonb_array_elements(v_rows) row; END IF;
 IF p_table='ops_command_results' THEN SELECT coalesce(jsonb_agg(row - 'result'),'[]'::jsonb) INTO v_rows FROM jsonb_array_elements(v_rows) row; END IF;
 RETURN v_rows;
END $$;
CREATE FUNCTION ops_export_user_table(p_user_id uuid,p_table text,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_where text; v_order text; v_rows jsonb;
BEGIN
 IF p_table !~ '^ops_[a-z0-9_]+$' OR p_offset<0 OR p_offset>1000000 OR NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=p_table)
 THEN RAISE EXCEPTION 'Invalid user export request' USING ERRCODE='22023'; END IF;
 SELECT string_agg(format('%I=$1',column_name),' OR ') INTO v_where FROM information_schema.columns
  WHERE table_schema='public' AND table_name=p_table AND column_name IN
   ('user_id','created_by','actor_user_id','requested_by','owner_user_id','uploaded_by','creator_user_id','updated_by','received_by','inspected_by','resolved_by','handed_over_by','accepted_by','reviewed_by');
 IF v_where IS NULL THEN RETURN '[]'::jsonb; END IF;
 SELECT string_agg(format('%I',a.attname),',' ORDER BY key.ordinality) INTO v_order
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary
 JOIN unnest(i.indkey) WITH ORDINALITY AS key(attnum,ordinality) ON true
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum
 WHERE n.nspname='public' AND c.relname=p_table;
 IF v_order IS NULL THEN RAISE EXCEPTION 'Table has no stable user export key' USING ERRCODE='22023'; END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE %s ORDER BY %s LIMIT 500 OFFSET $2) t',p_table,v_where,v_order)
  INTO v_rows USING p_user_id,p_offset;
 IF p_table='ops_credentials' THEN SELECT coalesce(jsonb_agg(row - 'ciphertext'),'[]'::jsonb) INTO v_rows FROM jsonb_array_elements(v_rows) row; END IF;
 IF p_table='ops_invitations' THEN SELECT coalesce(jsonb_agg(row - 'token_hash'),'[]'::jsonb) INTO v_rows FROM jsonb_array_elements(v_rows) row; END IF;
 IF p_table='ops_command_results' THEN SELECT coalesce(jsonb_agg(row - 'result'),'[]'::jsonb) INTO v_rows FROM jsonb_array_elements(v_rows) row; END IF;
 RETURN v_rows;
END $$;
CREATE FUNCTION ops_mark_media_purged(p_workspace_id uuid,p_asset_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_asset ops_media_assets%ROWTYPE; v_days integer; v_count bigint;
BEGIN
 SELECT * INTO v_asset FROM ops_media_assets WHERE workspace_id=p_workspace_id AND id=p_asset_id FOR UPDATE;
 SELECT media_retention_days INTO v_days FROM ops_workspace_settings WHERE workspace_id=p_workspace_id;
 IF NOT FOUND OR v_asset.id IS NULL OR v_asset.state NOT IN('retired','failed') OR v_asset.created_at>=now()-make_interval(days=>v_days)
 THEN RAISE EXCEPTION 'Media not eligible for retention cleanup' USING ERRCODE='22023'; END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM storage.objects WHERE (bucket_id=''ops-originals'' AND name=$1) OR (bucket_id=''ops-derivatives'' AND name=$2)'
   INTO v_count USING v_asset.original_path,v_asset.derivative_path;
  IF v_count>0 THEN RAISE EXCEPTION 'Media objects still exist' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE ops_media_assets SET purged_at=coalesce(purged_at,now()) WHERE id=p_asset_id;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION ops_invite_create(uuid,text,text,uuid),ops_member_update(uuid,uuid,text,boolean,uuid),ops_invite_accept(text,uuid),ops_invite_revoke(uuid,uuid,uuid),ops_settings_update(uuid,bigint,text,integer,uuid),ops_request_workspace_deletion(uuid,uuid),ops_store_credential(uuid,text,text,integer,text,uuid),ops_delete_credential(uuid,text,uuid),ops_execute_workspace_deletion(uuid,uuid),ops_list_workspace_storage(uuid,integer),ops_retention_candidates(uuid,integer),ops_mark_media_purged(uuid,uuid),ops_export_table_names(),ops_export_workspace_table(uuid,text,integer),ops_export_user_table(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops_invite_create(uuid,text,text,uuid),ops_invite_accept(text,uuid),ops_member_update(uuid,uuid,text,boolean,uuid),ops_invite_revoke(uuid,uuid,uuid),ops_settings_update(uuid,bigint,text,integer,uuid),ops_request_workspace_deletion(uuid,uuid),ops_store_credential(uuid,text,text,integer,text,uuid),ops_delete_credential(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ops_execute_workspace_deletion(uuid,uuid),ops_list_workspace_storage(uuid,integer),ops_retention_candidates(uuid,integer),ops_mark_media_purged(uuid,uuid),ops_export_table_names(),ops_export_workspace_table(uuid,text,integer),ops_export_user_table(uuid,text,integer) TO service_role;
