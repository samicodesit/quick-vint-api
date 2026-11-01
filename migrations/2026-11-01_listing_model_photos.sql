BEGIN;
-- Private jobs also hold the one reusable rear companion (kind=rear).
CREATE TABLE public.listing_photo_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 model_id uuid NOT NULL REFERENCES public.user_models(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'listing' CHECK(kind IN ('listing','rear')),
 fingerprint text NOT NULL, generation_id text,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','ready','skipped','failed','cancelled')),
 payload jsonb NOT NULL DEFAULT '{}', retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 1),
 lease_token uuid, lease_until timestamptz, error_code text,
 reserved_usd numeric NOT NULL DEFAULT 0, cost_usd numeric NOT NULL DEFAULT 0,
 budget_date date, budget_attempt integer NOT NULL DEFAULT -1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 source_expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 UNIQUE(model_id,kind,fingerprint)
);
CREATE TABLE public.listing_photo_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.listing_photo_jobs(id) ON DELETE SET NULL,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 stage text NOT NULL, lease_token uuid NOT NULL, status text NOT NULL DEFAULT 'running',
 metrics jsonb NOT NULL DEFAULT '{}', cost_usd numeric, object_key text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 retain_until timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
CREATE INDEX listing_photo_recovery ON public.listing_photo_jobs(state,lease_until);
CREATE INDEX listing_photo_attempt_job ON public.listing_photo_attempts(job_id);
ALTER TABLE public.listing_photo_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_photo_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_photo_jobs,public.listing_photo_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.listing_photo_jobs,public.listing_photo_attempts TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('listing-model-photos','listing-model-photos',false,10485760,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false;

CREATE FUNCTION public.listing_photo_daily_cost() RETURNS numeric
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT sum(cost_usd) FROM listing_photo_attempts WHERE created_at>=current_date),0)
 + coalesce((SELECT sum(greatest(j.reserved_usd-coalesce((SELECT sum(a.cost_usd) FROM listing_photo_attempts a WHERE a.job_id=j.id AND a.created_at>=current_date),0),0)) FROM listing_photo_jobs j WHERE j.budget_date=current_date),0)
$$;
REVOKE ALL ON FUNCTION public.listing_photo_daily_cost() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listing_photo_daily_cost() TO service_role;

-- Preserve the current payment guard and include image spend for text admissions too.
CREATE OR REPLACE FUNCTION public.reserve_generation_request_for_current_status(
 p_user_id uuid,p_pricing_limits_mode text,p_effective_tier text,
 p_monthly_limit integer,p_daily_limit integer,p_burst_limit integer,
 p_free_lifetime_limit integer,p_has_unlimited_daily boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE profile_status text; profile_tier text; protected_access_end timestamptz; text_cost numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(901129);
 SELECT coalesce(estimated_cost,0) INTO text_cost FROM daily_stats WHERE date=current_date::text;
 IF coalesce(text_cost,0)+listing_photo_daily_cost()+0.0201>100 THEN
  RETURN jsonb_build_object('allowed',false,'code','service_unavailable','limitScope','service');
 END IF;
 SELECT subscription_status,subscription_tier,paid_access_expires_at INTO profile_status,profile_tier,protected_access_end
 FROM profiles WHERE id=p_user_id FOR UPDATE;
 IF profile_status IN ('past_due','unpaid') OR (protected_access_end IS NOT NULL AND protected_access_end<=now()) THEN
  RETURN jsonb_build_object('allowed',false,'code','payment_required','currentTier',coalesce(profile_tier,p_effective_tier),'error','Payment for your subscription is overdue. Update your payment method to continue.');
 END IF;
 RETURN reserve_generation_request(p_user_id,p_pricing_limits_mode,p_effective_tier,p_monthly_limit,p_daily_limit,p_burst_limit,p_free_lifetime_limit,p_has_unlimited_daily);
END $$;
REVOKE ALL ON FUNCTION public.reserve_generation_request_for_current_status(uuid,text,text,integer,integer,integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_generation_request_for_current_status(uuid,text,text,integer,integer,integer,integer,boolean) TO service_role;

CREATE FUNCTION public.listing_photo_mutate(p_user_id uuid,p_action text,p_input jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j listing_photo_jobs; m user_models; s user_model_settings; a listing_photo_attempts;
 token uuid; amount numeric; spent numeric; current_text_cost numeric; job_kind text; admission jsonb; params jsonb;
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'photo_unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,29));
 SELECT * INTO s FROM user_model_settings WHERE user_id=p_user_id;
 SELECT * INTO m FROM user_models WHERE user_id=p_user_id AND state='ready';
 IF p_action IN ('create','admit') THEN
  IF NOT coalesce(s.enabled,false) OR s.erasing OR m.id IS NULL THEN RETURN NULL; END IF;
  job_kind:=coalesce(p_input->>'kind','listing');
  -- A new explicit listing admission may replace cancelled work. Retain the
  -- old row, attempts and reserved spend, including uncertain provider calls.
  IF job_kind='listing' THEN
   UPDATE listing_photo_jobs SET fingerprint=fingerprint||':cancelled:'||id::text
    WHERE model_id=m.id AND kind='listing' AND fingerprint=p_input->>'fingerprint' AND state='cancelled';
  END IF;
  IF p_action='admit' THEN
   SELECT * INTO j FROM listing_photo_jobs WHERE model_id=m.id AND kind='listing' AND fingerprint=p_input->>'fingerprint';
   IF j.id IS NOT NULL THEN RETURN to_jsonb(j); END IF;
   params:=p_input->'limits';
   admission:=reserve_generation_request_for_current_status(p_user_id,params->>'pricingLimitsMode',params->>'effectiveTier',
    (params->>'monthlyLimit')::integer,(params->>'dailyLimit')::integer,(params->>'burstLimit')::integer,
    (params->>'freeLifetimeLimit')::integer,(params->>'hasUnlimitedDaily')::boolean);
   IF NOT coalesce((admission->>'allowed')::boolean,false) THEN RETURN admission; END IF;
   p_input:=p_input||jsonb_build_object('generationId',admission->>'reservationId');
  END IF;
  IF job_kind='listing' AND nullif(p_input->>'generationId','') IS NULL THEN RAISE EXCEPTION 'photo_not_admitted'; END IF;
  INSERT INTO listing_photo_jobs(user_id,model_id,kind,fingerprint,generation_id,payload,expires_at)
  VALUES(p_user_id,m.id,job_kind,p_input->>'fingerprint',p_input->>'generationId',
   jsonb_build_object('sources',coalesce(p_input->'sources','[]'::jsonb),'photoOnly',p_action='admit'),
   CASE WHEN job_kind='rear' THEN 'infinity'::timestamptz ELSE now()+interval '30 days' END)
  ON CONFLICT(model_id,kind,fingerprint) DO NOTHING;
  SELECT * INTO j FROM listing_photo_jobs WHERE model_id=m.id AND kind=job_kind AND fingerprint=p_input->>'fingerprint';
  RETURN to_jsonb(j);
 END IF;
 SELECT * INTO j FROM listing_photo_jobs WHERE id=(p_input->>'id')::uuid AND user_id=p_user_id FOR UPDATE;
 IF j.id IS NULL THEN RETURN NULL; END IF;
 -- Account disable/erasure also fences a worker that has already called the provider.
 IF NOT coalesce(s.enabled,false) OR s.erasing OR m.id IS DISTINCT FROM j.model_id THEN
  IF j.payload->>'photoOnly'='true' THEN
   PERFORM refund_generation_reservation(j.generation_id::uuid,'photo_cancelled');
  END IF;
  UPDATE listing_photo_jobs SET state=CASE WHEN state='ready' THEN state ELSE 'cancelled' END,
   lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
  RETURN NULL;
 END IF;
 IF j.state='running' AND j.lease_until<now() THEN
  UPDATE listing_photo_jobs SET state='failed',error_code='worker_interrupted',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 IF j.state IN ('queued','running') AND ((j.kind='listing' AND j.source_expires_at<now()) OR j.created_at<now()-interval '15 minutes') THEN
  UPDATE listing_photo_jobs SET state='failed',error_code='operation_expired',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 IF p_action='get' THEN RETURN to_jsonb(j); END IF;
 IF p_action IN ('attached','attachment_failed','order_failed','capacity') THEN
  UPDATE listing_photo_jobs SET payload=payload||jsonb_build_object('attachment',p_action,'attachmentAt',now(),
   'attachmentFailures',coalesce((payload->>'attachmentFailures')::integer,0)+CASE WHEN p_action='attachment_failed' THEN 1 ELSE 0 END)
   WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
 END IF;
 IF p_action='cancel' THEN
  IF j.payload->>'photoOnly'='true' THEN
   PERFORM refund_generation_reservation(j.generation_id::uuid,'photo_cancelled');
  END IF;
  UPDATE listing_photo_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
 END IF;
 IF p_action='retry' THEN
  IF j.state<>'failed' AND NOT (j.kind='rear' AND j.state='cancelled') THEN RETURN to_jsonb(j); END IF;
  IF j.retry_count>=1 OR (j.kind='listing' AND j.source_expires_at<now()) OR j.expires_at<now() THEN RAISE EXCEPTION 'photo_retry_limit'; END IF;
  UPDATE listing_photo_jobs SET state='queued',retry_count=retry_count+1,error_code=NULL,updated_at=now(),created_at=now()
   WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
 END IF;
 IF p_action='claim' THEN
  IF j.state<>'queued' THEN RETURN NULL; END IF;
  IF j.kind='listing' AND (SELECT count(*) FROM listing_photo_jobs WHERE user_id=p_user_id AND kind='listing' AND state='running' AND lease_until>now())>=2 THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(901129);
  SELECT coalesce(estimated_cost,0) INTO current_text_cost FROM daily_stats WHERE date=current_date::text;
  SELECT listing_photo_daily_cost() INTO spent;
  amount:=CASE WHEN j.budget_date=current_date AND j.budget_attempt=j.retry_count THEN 0 WHEN j.kind='rear' THEN 0.08 ELSE 0.20 END;
  IF coalesce(current_text_cost,0)+spent+amount>100 THEN RAISE EXCEPTION 'photo_budget'; END IF;
  token:=gen_random_uuid();
  UPDATE listing_photo_jobs SET state='running',lease_token=token,lease_until=now()+interval '100 seconds',
   reserved_usd=CASE WHEN budget_date=current_date THEN reserved_usd+amount ELSE amount END,
   budget_date=current_date,budget_attempt=retry_count,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
 END IF;
 IF j.state<>'running' OR j.lease_token IS DISTINCT FROM (p_input->>'lease')::uuid THEN RETURN NULL; END IF;
 IF p_action='stage' THEN
  INSERT INTO listing_photo_attempts(job_id,user_id,stage,lease_token,object_key,retain_until)
   VALUES(j.id,p_user_id,p_input->>'stage',j.lease_token,p_input->>'objectKey',
    CASE WHEN p_input->>'stage'='source' THEN j.source_expires_at ELSE now()+interval '30 days' END) RETURNING * INTO a;
  RETURN to_jsonb(a);
 END IF;
 IF p_action='metrics' THEN
  UPDATE listing_photo_attempts SET metrics=coalesce(p_input->'metrics','{}'),cost_usd=(p_input->>'cost')::numeric,
   status=coalesce(p_input->>'status','complete'),completed_at=now()
   WHERE id=(p_input->>'attemptId')::uuid AND job_id=j.id AND lease_token=j.lease_token;
  UPDATE listing_photo_jobs SET cost_usd=(SELECT coalesce(sum(cost_usd),0) FROM listing_photo_attempts WHERE job_id=j.id),updated_at=now() WHERE id=j.id;
  RETURN to_jsonb(j);
 END IF;
 IF p_action='save' THEN
  IF coalesce((j.payload->>'photoOnly')::boolean,false) THEN
   IF p_input->'payload'->'plan'->>'eligible'='true' THEN
    IF NOT commit_generation_reservation(j.generation_id::uuid) THEN RAISE EXCEPTION 'photo_admission_expired'; END IF;
   ELSIF p_input->>'state'='skipped' THEN
    PERFORM refund_generation_reservation(j.generation_id::uuid,'photo_item_ineligible');
   END IF;
  END IF;
  UPDATE listing_photo_jobs SET payload=payload||coalesce(p_input->'payload','{}'),
   state=coalesce(p_input->>'state',state),error_code=p_input->>'errorCode',updated_at=now(),
   lease_token=CASE WHEN p_input ? 'state' THEN NULL ELSE lease_token END,
   lease_until=CASE WHEN p_input ? 'state' THEN NULL ELSE now()+interval '100 seconds' END,
   reserved_usd=CASE WHEN p_input->>'state' IN ('ready','skipped','failed','cancelled') AND NOT EXISTS(
    SELECT 1 FROM listing_photo_attempts WHERE job_id=j.id AND cost_usd IS NULL) THEN 0 ELSE reserved_usd END
   WHERE id=j.id RETURNING * INTO j;
  IF j.kind='rear' AND j.state='ready' THEN
   UPDATE listing_photo_attempts SET retain_until='infinity' WHERE job_id=j.id AND object_key=j.payload->'primary'->>'key';
  END IF;
  RETURN to_jsonb(j);
 END IF;
 RAISE EXCEPTION 'invalid_photo_action';
END $$;
REVOKE ALL ON FUNCTION public.listing_photo_mutate(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listing_photo_mutate(uuid,text,jsonb) TO service_role;
CREATE FUNCTION public.listing_photo_cleanup() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j listing_photo_jobs;
BEGIN
 FOR j IN SELECT * FROM listing_photo_jobs WHERE source_expires_at<now() AND payload->>'photoOnly'='true' AND (payload ? 'sources' OR payload ? 'sourceKeys') LOOP
  PERFORM refund_generation_reservation(j.generation_id::uuid,'photo_sources_expired');
 END LOOP;
 UPDATE listing_photo_jobs SET payload=payload-'sources'-'sourceKeys' WHERE source_expires_at<now() AND (payload ? 'sources' OR payload ? 'sourceKeys');
 DELETE FROM listing_photo_jobs WHERE expires_at<now();
END $$;
REVOKE ALL ON FUNCTION public.listing_photo_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listing_photo_cleanup() TO service_role;
COMMIT;
