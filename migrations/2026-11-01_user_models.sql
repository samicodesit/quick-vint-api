-- One permanent model per account. All access goes through authenticated server code.
BEGIN;
CREATE TABLE public.user_model_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_state text NOT NULL DEFAULT 'unseen' CHECK(invitation_state IN ('unseen','seen','dismissed','created')),
  enabled boolean NOT NULL DEFAULT false, erasing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL, seed text NOT NULL, scene jsonb NOT NULL, scene_fingerprint text NOT NULL,
  prompt_version integer NOT NULL, catalog_version integer NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','ready','failed','deleted')),
  operation_id uuid NOT NULL DEFAULT gen_random_uuid(), operation_deadline timestamptz NOT NULL DEFAULT now()+interval '3 minutes',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 2),
  total_attempts integer NOT NULL DEFAULT 0 CHECK(total_attempts BETWEEN 0 AND 6),
  lease_token uuid, lease_until timestamptz, object_key text, width integer, height integer, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_model_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation_id uuid NOT NULL, attempt_number integer NOT NULL, lease_token uuid NOT NULL,
  object_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'running',
  metrics jsonb NOT NULL DEFAULT '{}', error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, cleanup_after timestamptz,
  UNIQUE(operation_id,attempt_number)
);
CREATE INDEX user_model_recovery ON public.user_models(state,lease_until) WHERE state IN ('queued','running');
CREATE INDEX user_model_cleanup ON public.user_model_attempts(cleanup_after);
ALTER TABLE public.user_model_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_model_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_model_settings,public.user_models,public.user_model_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.user_model_settings,public.user_models,public.user_model_attempts TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('user-models','user-models',false,10485760,ARRAY['image/jpeg'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=ARRAY['image/jpeg'];

CREATE FUNCTION public.user_model_mutate(p_user_id uuid,p_action text,p_input jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s user_model_settings; m user_models; token uuid; claimed boolean:=false;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'model_unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  -- Stale workers must not recreate rows after account deletion.
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RETURN NULL; END IF;
  INSERT INTO user_model_settings(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM user_model_settings WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO m FROM user_models WHERE user_id=p_user_id FOR UPDATE;
  IF p_action='get' THEN
    RETURN jsonb_build_object('invitationState',s.invitation_state,'enabled',s.enabled,'model',CASE WHEN m.id IS NULL THEN NULL ELSE to_jsonb(m) END);
  END IF;
  IF p_action='erase' THEN
    UPDATE user_model_settings SET erasing=true,enabled=false,updated_at=now() WHERE user_id=p_user_id;
    UPDATE user_models SET state='deleted',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE user_id=p_user_id;
    UPDATE user_model_attempts SET cleanup_after=now()+interval '10 minutes' WHERE user_id=p_user_id;
    RETURN NULL;
  END IF;
  IF p_action IN ('finish','fail') THEN
    IF s.erasing OR m.state<>'running' OR m.operation_id IS DISTINCT FROM (p_input->>'operationId')::uuid
      OR m.lease_token IS DISTINCT FROM (p_input->>'lease')::uuid OR m.lease_until<now() OR m.operation_deadline<now() THEN RETURN NULL; END IF;
    UPDATE user_model_attempts SET status=CASE WHEN p_action='finish' THEN 'accepted' ELSE 'failed' END,
      completed_at=now(),metrics=COALESCE(p_input->'metrics','{}'),error_code=p_input->>'errorCode',
      cleanup_after=CASE WHEN p_action='finish' THEN NULL ELSE now()+interval '10 minutes' END
      WHERE lease_token=m.lease_token AND operation_id=m.operation_id;
    IF p_action='finish' THEN
      UPDATE user_models SET state='ready',object_key=id::text||'/'||operation_id::text||'/'||attempt_count||'.jpg',
        width=1024,height=1536,lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=m.id RETURNING * INTO m;
      UPDATE user_model_settings SET enabled=true,invitation_state='created',updated_at=now() WHERE user_id=p_user_id;
    ELSE
      UPDATE user_models SET state=CASE WHEN attempt_count<2 AND total_attempts<6 THEN 'queued' ELSE 'failed' END,
        lease_token=NULL,lease_until=NULL,error_code=p_input->>'errorCode',updated_at=now() WHERE id=m.id RETURNING * INTO m;
    END IF;
    RETURN to_jsonb(m);
  END IF;
  IF s.erasing THEN RAISE EXCEPTION 'model_erasing'; END IF;
  IF p_action='invite' THEN
    IF s.invitation_state='unseen' AND m.id IS NULL THEN
      UPDATE user_model_settings SET invitation_state='seen',updated_at=now() WHERE user_id=p_user_id;
      claimed:=true;
    END IF;
    RETURN jsonb_build_object('claimed',claimed);
  END IF;
  IF p_action='dismiss' THEN
    UPDATE user_model_settings SET invitation_state=CASE WHEN invitation_state='created' THEN 'created' ELSE 'dismissed' END,updated_at=now() WHERE user_id=p_user_id;
    RETURN NULL;
  END IF;
  IF p_action='enable' THEN
    IF m.state IS DISTINCT FROM 'ready' THEN RAISE EXCEPTION 'model_not_ready'; END IF;
    IF jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_enabled'; END IF;
    UPDATE user_model_settings SET enabled=(p_input->>'enabled')::boolean,updated_at=now() WHERE user_id=p_user_id;
    RETURN NULL;
  END IF;
  IF p_action='create' THEN
    IF m.id IS NOT NULL THEN RETURN to_jsonb(m); END IF;
    INSERT INTO user_models(user_id,preferences,seed,scene,scene_fingerprint,prompt_version,catalog_version)
      VALUES(p_user_id,p_input->'preferences',p_input->>'seed',p_input->'scene',p_input->>'fingerprint',(p_input->>'promptVersion')::integer,(p_input->>'catalogVersion')::integer) RETURNING * INTO m;
    UPDATE user_model_settings SET invitation_state='seen',updated_at=now() WHERE user_id=p_user_id;
    RETURN to_jsonb(m);
  END IF;
  IF p_action='retry' THEN
    IF m.id IS NULL THEN RAISE EXCEPTION 'model_not_found'; END IF;
    IF m.state<>'failed' THEN RETURN to_jsonb(m); END IF;
    IF m.total_attempts>=6 THEN RAISE EXCEPTION 'model_retry_limit'; END IF;
    IF m.updated_at>now()-interval '30 seconds' THEN RAISE EXCEPTION 'model_retry_wait'; END IF;
    UPDATE user_models SET state='queued',operation_id=gen_random_uuid(),operation_deadline=now()+interval '3 minutes',
      attempt_count=0,lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=m.id RETURNING * INTO m;
    RETURN to_jsonb(m);
  END IF;
  IF p_action='claim' THEN
    IF m.id IS NULL OR m.operation_id IS DISTINCT FROM (p_input->>'operationId')::uuid OR m.state NOT IN ('queued','running')
      OR (m.state='running' AND m.lease_until>now()) THEN RETURN NULL; END IF;
    UPDATE user_model_attempts SET status='expired',error_code='worker_expired',completed_at=now(),cleanup_after=now()+interval '10 minutes'
      WHERE operation_id=m.operation_id AND status='running';
    IF m.attempt_count>=2 OR m.total_attempts>=6 OR m.operation_deadline<now() THEN
      UPDATE user_models SET state='failed',error_code='operation_expired',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=m.id;
      RETURN NULL;
    END IF;
    token:=gen_random_uuid();
    UPDATE user_models SET state='running',attempt_count=attempt_count+1,total_attempts=total_attempts+1,
      lease_token=token,lease_until=now()+interval '80 seconds',updated_at=now() WHERE id=m.id RETURNING * INTO m;
    INSERT INTO user_model_attempts(user_id,operation_id,attempt_number,lease_token,object_key)
      VALUES(p_user_id,m.operation_id,m.attempt_count,token,m.id::text||'/'||m.operation_id::text||'/'||m.attempt_count||'.jpg');
    RETURN to_jsonb(m);
  END IF;
  RAISE EXCEPTION 'invalid_model_action';
END $$;
REVOKE ALL ON FUNCTION public.user_model_mutate(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.user_model_mutate(uuid,text,jsonb) TO service_role;
COMMIT;
