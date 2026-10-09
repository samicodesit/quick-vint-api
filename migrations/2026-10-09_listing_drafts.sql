-- Additive, service-only browser draft storage. No existing account/usage schema changes.
BEGIN;
CREATE TABLE public.listing_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK(length(title)<=200), description text NOT NULL DEFAULT '' CHECK(length(description)<=10000),
  settings jsonb NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','done')),
  version integer NOT NULL DEFAULT 1, input_version integer NOT NULL DEFAULT 1,
  operation_id uuid, operation_state text NOT NULL DEFAULT 'idle' CHECK(operation_state IN ('idle','running','pending','succeeded','failed')),
  operation_started_at timestamptz, operation_hash text CHECK(operation_hash ~ '^[a-f0-9]{64}$'), reservation_id uuid, pending_result jsonb CHECK(octet_length(pending_result::text)<=32768),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  UNIQUE(id,user_id)
);
CREATE TABLE public.listing_draft_photos (
  -- Retain anonymous object tombstones after erasure until outstanding upload grants expire.
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, import_id uuid NOT NULL,
  draft_id uuid REFERENCES public.listing_drafts(id) ON DELETE SET NULL, object_key text NOT NULL UNIQUE, bytes integer NOT NULL CHECK(bytes>0 AND bytes<=4194304),
  position integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
  digest text, created_at timestamptz NOT NULL DEFAULT now(), grant_expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours', deleted_at timestamptz,
  FOREIGN KEY(draft_id,user_id) REFERENCES public.listing_drafts(id,user_id) ON DELETE SET NULL (draft_id)
);
CREATE INDEX listing_drafts_library ON public.listing_drafts(user_id,state,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX listing_draft_photos_owner ON public.listing_draft_photos(user_id,import_id,draft_id);
CREATE INDEX listing_draft_photos_item ON public.listing_draft_photos(draft_id,position) WHERE deleted_at IS NULL;
ALTER TABLE public.listing_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_draft_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_drafts,public.listing_draft_photos FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.listing_drafts,public.listing_draft_photos TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('listing-drafts','listing-drafts',false,4194304,ARRAY['image/jpeg']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=4194304,allowed_mime_types=ARRAY['image/jpeg'];

CREATE OR REPLACE FUNCTION public.listing_draft_mutate(p_user_id uuid,p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.listing_drafts; p public.listing_draft_photos; source public.listing_drafts;
  ids uuid[]; item_id uuid; operation uuid; n integer; actual_bytes integer; result jsonb; previous record;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'draft_unauthorized'; END IF;
  -- Serialize capacity reservations, regrouping and operation claims for one account.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  IF p_action='expireUpload' THEN
    -- Fence renewal/finalization, then retain the tombstone through the in-flight upload grace.
    UPDATE listing_draft_photos SET deleted_at=now(),grant_expires_at=now()+interval '2 hours'
      WHERE id=(p_input->>'photoId')::uuid AND user_id=p_user_id AND status='pending' AND deleted_at IS NULL
      AND grant_expires_at<(p_input->>'cutoff')::timestamptz RETURNING * INTO p;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN to_jsonb(p);
  END IF;
  IF p_action='create' THEN
    item_id:=COALESCE((p_input->>'id')::uuid,gen_random_uuid());
    SELECT * INTO d FROM listing_drafts WHERE id=item_id AND user_id=p_user_id AND deleted_at IS NULL;
    IF FOUND THEN RETURN to_jsonb(d); END IF;
    IF (SELECT count(*) FROM listing_drafts WHERE user_id=p_user_id AND deleted_at IS NULL)>=500 THEN RAISE EXCEPTION 'draft_limit'; END IF;
    SELECT COALESCE(array_agg(value::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(COALESCE(p_input->'photoIds','[]'));
    IF cardinality(ids)>10 THEN RAISE EXCEPTION 'photo_limit'; END IF;
    IF (SELECT count(*) FROM listing_draft_photos WHERE id=ANY(ids) AND user_id=p_user_id AND status='ready' AND draft_id IS NULL AND deleted_at IS NULL)<>cardinality(ids) THEN RAISE EXCEPTION 'photo_not_found'; END IF;
    INSERT INTO listing_drafts(id,user_id,settings) VALUES(item_id,p_user_id,COALESCE(p_input->'settings','{"titleLanguageCode":"en","descriptionLanguageCode":"en","descriptionLength":"long","useBulletPoints":true}')) RETURNING * INTO d;
    UPDATE listing_draft_photos SET draft_id=d.id,position=array_position(ids,id)-1 WHERE id=ANY(ids);
    RETURN to_jsonb(d);
  END IF;
  IF p_action='grant' THEN
    actual_bytes:=(p_input->>'bytes')::integer;
    IF actual_bytes IS NULL OR actual_bytes<1 OR actual_bytes>4194304 THEN RAISE EXCEPTION 'photo_size'; END IF;
    SELECT * INTO p FROM listing_draft_photos WHERE id=(p_input->>'photoId')::uuid;
    IF FOUND THEN
      IF p.user_id<>p_user_id OR p.import_id<>(p_input->>'importId')::uuid OR p.bytes<>actual_bytes OR p.draft_id IS DISTINCT FROM (p_input->>'draftId')::uuid OR p.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'photo_conflict'; END IF;
      IF p.status='pending' THEN UPDATE listing_draft_photos SET grant_expires_at=now()+interval '2 hours' WHERE id=p.id RETURNING * INTO p; END IF;
      RETURN to_jsonb(p);
    END IF;
    IF (SELECT COALESCE(sum(bytes),0) FROM listing_draft_photos WHERE user_id=p_user_id)+actual_bytes>536870912 THEN RAISE EXCEPTION 'storage_limit'; END IF;
    IF (SELECT count(*) FROM listing_draft_photos WHERE user_id=p_user_id AND import_id=(p_input->>'importId')::uuid AND deleted_at IS NULL)>=100 THEN RAISE EXCEPTION 'import_limit'; END IF;
    IF p_input->>'draftId' IS NOT NULL THEN
      SELECT * INTO d FROM listing_drafts WHERE id=(p_input->>'draftId')::uuid AND user_id=p_user_id AND deleted_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
      IF d.operation_state IN ('running','pending') THEN RAISE EXCEPTION 'generation_in_progress'; END IF;
      SELECT count(*) INTO n FROM listing_draft_photos WHERE draft_id=d.id AND deleted_at IS NULL;
      IF n>=10 THEN RAISE EXCEPTION 'photo_limit'; END IF;
    ELSE n:=0; END IF;
    INSERT INTO listing_draft_photos(id,user_id,import_id,draft_id,object_key,bytes,position)
    VALUES((p_input->>'photoId')::uuid,p_user_id,(p_input->>'importId')::uuid,d.id,p_user_id::text||'/'||(p_input->>'importId')||'/'||(p_input->>'photoId')||'.jpg',actual_bytes,n) RETURNING * INTO p;
    RETURN to_jsonb(p);
  END IF;
  IF p_action IN ('completeUpload','removePhoto') THEN
    SELECT * INTO p FROM listing_draft_photos WHERE id=(p_input->>'photoId')::uuid AND user_id=p_user_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'photo_not_found'; END IF;
    IF p.draft_id IS NOT NULL THEN
      SELECT * INTO d FROM listing_drafts WHERE id=p.draft_id AND user_id=p_user_id AND deleted_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
      IF d.operation_state IN ('running','pending') THEN RAISE EXCEPTION 'generation_in_progress'; END IF;
    END IF;
    IF p_action='removePhoto' THEN UPDATE listing_draft_photos SET deleted_at=now() WHERE id=p.id RETURNING * INTO p;
    ELSE
      IF p.status='ready' THEN RETURN to_jsonb(p); END IF;
      IF (p_input->>'bytes')::integer<>p.bytes OR (p_input->>'digest') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'photo_size'; END IF;
      UPDATE listing_draft_photos SET status='ready',digest=p_input->>'digest' WHERE id=p.id RETURNING * INTO p;
    END IF;
    IF d.id IS NOT NULL THEN UPDATE listing_drafts SET version=version+1,input_version=input_version+1,updated_at=now() WHERE id=d.id; END IF;
    RETURN to_jsonb(p);
  END IF;
  SELECT * INTO d FROM listing_drafts WHERE id=(p_input->>'draftId')::uuid AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  operation:=(p_input->>'operationId')::uuid;
  IF p_action IN ('save','group','delete') THEN
    IF d.version<>(p_input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'draft_conflict'; END IF;
    IF p_action<>'delete' AND d.operation_state IN ('running','pending') THEN RAISE EXCEPTION 'generation_in_progress'; END IF;
  END IF;
  IF p_action='save' THEN
    UPDATE listing_drafts SET title=COALESCE(p_input->>'title',title),description=COALESCE(p_input->>'description',description),
      settings=COALESCE(p_input->'settings',settings),state=COALESCE(p_input->>'state',state),
      input_version=input_version+CASE WHEN p_input ? 'settings' AND p_input->'settings'<>settings THEN 1 ELSE 0 END,
      version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  ELSIF p_action='group' THEN
    SELECT COALESCE(array_agg(value::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(p_input->'photoIds');
    IF cardinality(ids)>10 THEN RAISE EXCEPTION 'photo_limit'; END IF;
    IF (SELECT count(*) FROM listing_draft_photos WHERE id=ANY(ids) AND user_id=p_user_id AND status='ready' AND deleted_at IS NULL)<>cardinality(ids) THEN RAISE EXCEPTION 'photo_not_found'; END IF;
    FOR source IN SELECT * FROM listing_drafts WHERE id IN (SELECT draft_id FROM listing_draft_photos WHERE id=ANY(ids) AND draft_id<>d.id) LOOP
      IF source.operation_state IN ('running','pending') THEN RAISE EXCEPTION 'generation_in_progress'; END IF;
      IF source.version IS DISTINCT FROM (p_input->'sourceVersions'->>source.id::text)::integer THEN RAISE EXCEPTION 'draft_conflict'; END IF;
      UPDATE listing_drafts SET version=version+1,input_version=input_version+1,updated_at=now() WHERE id=source.id;
    END LOOP;
    IF EXISTS(SELECT 1 FROM listing_draft_photos WHERE draft_id=d.id AND status='pending' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'photos_not_ready'; END IF;
    UPDATE listing_draft_photos SET draft_id=NULL WHERE draft_id=d.id AND NOT(id=ANY(ids)) AND deleted_at IS NULL;
    UPDATE listing_draft_photos SET draft_id=d.id,position=array_position(ids,id)-1 WHERE id=ANY(ids);
    UPDATE listing_drafts SET version=version+1,input_version=input_version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  ELSIF p_action='delete' THEN
    UPDATE listing_drafts SET deleted_at=now(),title='',description='',pending_result=NULL,version=version+1 WHERE id=d.id RETURNING * INTO d;
    UPDATE listing_draft_photos SET deleted_at=now() WHERE draft_id=d.id;
  ELSIF p_action='claim' THEN
    IF operation IS NULL THEN RAISE EXCEPTION 'invalid_operation'; END IF;
    IF d.operation_id=operation THEN
      IF d.input_version-1<>(p_input->>'inputVersion')::integer THEN RAISE EXCEPTION 'draft_conflict'; END IF;
      RETURN to_jsonb(d)||'{"_claimed":false}'::jsonb;
    END IF;
    IF d.operation_state IN ('running','pending') THEN RAISE EXCEPTION 'generation_in_progress'; END IF;
    IF d.input_version<>(p_input->>'inputVersion')::integer THEN RAISE EXCEPTION 'draft_conflict'; END IF;
    IF NOT EXISTS(SELECT 1 FROM listing_draft_photos WHERE draft_id=d.id AND status='ready' AND deleted_at IS NULL)
      OR EXISTS(SELECT 1 FROM listing_draft_photos WHERE draft_id=d.id AND status='pending' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'photos_not_ready'; END IF;
    UPDATE listing_drafts SET operation_id=operation,operation_state='running',operation_started_at=now(),operation_hash=NULL,reservation_id=NULL,pending_result=NULL,version=version+1,input_version=input_version+1 WHERE id=d.id RETURNING * INTO d;
    RETURN to_jsonb(d)||'{"_claimed":true}'::jsonb;
  ELSIF p_action='recover' THEN
    IF d.operation_state='running' THEN
      SELECT * INTO previous FROM mobile_generation_idempotency WHERE user_id=p_user_id AND request_id=d.operation_id AND request_hash IS NOT DISTINCT FROM d.operation_hash;
      IF FOUND AND previous.reservation_id IS NOT NULL THEN
        UPDATE listing_drafts SET reservation_id=previous.reservation_id,
          pending_result=CASE WHEN previous.response_json->>'title' IS NOT NULL AND previous.response_json->>'description' IS NOT NULL AND (previous.commit_pending OR previous.status='succeeded') THEN jsonb_build_object('title',previous.response_json->>'title','description',previous.response_json->>'description') ELSE NULL END,
          operation_state=CASE WHEN previous.response_json->>'title' IS NOT NULL AND previous.response_json->>'description' IS NOT NULL AND (previous.commit_pending OR previous.status='succeeded') THEN 'pending' ELSE 'running' END
          WHERE id=d.id RETURNING * INTO d;
      END IF;
      IF d.pending_result IS NULL AND (previous.status='failed' OR d.operation_started_at<now()-interval '3 minutes')
        AND NOT EXISTS(SELECT 1 FROM generation_reservations WHERE id=d.reservation_id AND status IN ('pending','committed')) THEN
        UPDATE listing_drafts SET operation_state='failed',version=version+1 WHERE id=d.id RETURNING * INTO d;
      END IF;
    END IF;
  ELSIF p_action IN ('fingerprint','bind','pending','complete','fail') THEN
    IF d.operation_id IS DISTINCT FROM operation THEN RAISE EXCEPTION 'operation_conflict'; END IF;
    IF p_action='fingerprint' THEN
      IF d.operation_state<>'running' OR (d.operation_hash IS NOT NULL AND d.operation_hash<>p_input->>'hash') THEN RAISE EXCEPTION 'operation_conflict'; END IF;
      UPDATE listing_drafts SET operation_hash=p_input->>'hash' WHERE id=d.id RETURNING * INTO d;
    ELSIF p_action='bind' THEN
      IF d.operation_state<>'running' THEN RAISE EXCEPTION 'operation_conflict'; END IF;
      IF d.reservation_id IS NOT NULL AND d.reservation_id<>(p_input->>'reservationId')::uuid THEN RAISE EXCEPTION 'operation_conflict'; END IF;
      IF NOT EXISTS(SELECT 1 FROM generation_reservations WHERE id=(p_input->>'reservationId')::uuid AND user_id=p_user_id AND status='pending') THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
      UPDATE listing_drafts SET reservation_id=(p_input->>'reservationId')::uuid WHERE id=d.id RETURNING * INTO d;
    ELSIF p_action='pending' THEN
      result:=p_input->'result';
      IF d.operation_state<>'running' OR d.reservation_id IS DISTINCT FROM (p_input->>'reservationId')::uuid THEN RAISE EXCEPTION 'operation_conflict'; END IF;
      IF result IS NULL OR length(result->>'title')>200 OR length(result->>'description')>10000 OR COALESCE(result->>'title','')='' OR COALESCE(result->>'description','')='' THEN RAISE EXCEPTION 'invalid_result'; END IF;
      UPDATE listing_drafts SET pending_result=jsonb_build_object('title',result->>'title','description',result->>'description'),operation_state='pending' WHERE id=d.id RETURNING * INTO d;
    ELSIF p_action='complete' THEN
      IF d.operation_state='succeeded' THEN RETURN to_jsonb(d); END IF;
      IF d.pending_result IS NULL OR NOT EXISTS(SELECT 1 FROM generation_reservations WHERE id=d.reservation_id AND user_id=p_user_id AND status='committed') THEN RAISE EXCEPTION 'generation_commit_pending'; END IF;
      UPDATE listing_drafts SET title=pending_result->>'title',description=pending_result->>'description',pending_result=NULL,operation_state='succeeded',version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
      UPDATE mobile_generation_idempotency SET status='succeeded',response_status=200,response_json=jsonb_build_object('title',d.title,'description',d.description),commit_pending=false,updated_at=now()
        WHERE user_id=p_user_id AND request_id=operation AND request_hash IS NOT DISTINCT FROM d.operation_hash AND reservation_id=d.reservation_id;
    ELSE
      IF EXISTS(SELECT 1 FROM generation_reservations WHERE id=d.reservation_id AND status IN ('pending','committed')) THEN RAISE EXCEPTION 'generation_commit_pending'; END IF;
      UPDATE listing_drafts SET operation_state='failed',pending_result=NULL,version=version+1 WHERE id=d.id RETURNING * INTO d;
    END IF;
  ELSE RAISE EXCEPTION 'invalid_draft_action'; END IF;
  RETURN to_jsonb(d);
END;
$$;
REVOKE ALL ON FUNCTION public.listing_draft_mutate(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listing_draft_mutate(uuid,text,jsonb) TO service_role;
COMMIT;
