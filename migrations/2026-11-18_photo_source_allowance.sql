BEGIN;

-- Photo-only admission already holds the profile lock while reserving allowance.
-- Snapshot its usage period in the same transaction, without changing charging.
CREATE FUNCTION public.snapshot_photo_allowance_period() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE period jsonb;
BEGIN
 SELECT jsonb_build_object('invoice',last_usage_reset_invoice_id,
   'end',last_usage_period_end,'reset',last_api_call_reset)
 INTO period FROM profiles WHERE id=NEW.user_id;
 NEW.payload:=NEW.payload||jsonb_build_object('allowancePeriod',period);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_photo_allowance_period() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER snapshot_photo_allowance_period BEFORE INSERT ON public.listing_photo_jobs
FOR EACH ROW WHEN (NEW.kind='listing' AND NEW.payload->>'photoOnly'='true')
EXECUTE FUNCTION public.snapshot_photo_allowance_period();

CREATE FUNCTION public.release_unused_photo_source_allowance(p_user_id uuid,p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j listing_photo_jobs; r generation_reservations; p profiles;
 period jsonb; same_period boolean; balance integer;
BEGIN
 IF p_user_id IS NULL THEN RETURN jsonb_build_object('released',false); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,29));
 SELECT * INTO j FROM listing_photo_jobs WHERE id=p_job_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR j.kind<>'listing' OR j.payload->>'photoOnly' IS DISTINCT FROM 'true'
   OR j.state<>'failed' OR j.retry_count<1 OR j.lease_token IS NOT NULL
   OR coalesce(j.error_code,'') NOT IN ('photo_source_snapshot_failed','worker_interrupted','operation_expired')
   OR j.payload->'plan'->>'eligible'='true'
   OR j.payload->'primary'->>'state'='ready' OR j.payload->'secondary'->>'state'='ready'
   OR EXISTS(SELECT 1 FROM listing_photo_attempts WHERE job_id=j.id AND stage<>'source')
 THEN RETURN jsonb_build_object('released',false,'reason','outside_scope'); END IF;
 SELECT * INTO r FROM generation_reservations
 WHERE id=j.generation_id::uuid AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.entitlement_type NOT IN ('plan','free_lifetime','pack_credit') THEN
  RETURN jsonb_build_object('released',false,'reason','already_resolved');
 END IF;
 SELECT * INTO p FROM profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('released',false,'reason','account_missing'); END IF;
 period:=jsonb_build_object('invoice',p.last_usage_reset_invoice_id,
   'end',p.last_usage_period_end,'reset',p.last_api_call_reset);
 IF j.payload ? 'allowancePeriod' THEN
  same_period:=j.payload->'allowancePeriod'=period;
 ELSIF p.last_api_call_reset IS NULL OR p.last_api_call_reset::date<r.created_at::date THEN
  same_period:=true;
 ELSIF p.last_api_call_reset::date>r.created_at::date THEN
  same_period:=false;
 ELSE
  -- Older jobs lack a period snapshot. Do not guess across a same-day reset.
  RETURN jsonb_build_object('released',false,'reason','period_review_required');
 END IF;
 IF r.counted_month AND same_period THEN
  UPDATE profiles SET api_calls_this_month=greatest(coalesce(api_calls_this_month,0)-1,0)
  WHERE id=p_user_id;
 END IF;
 IF r.entitlement_type='free_lifetime' THEN
  UPDATE profiles SET free_lifetime_generations_used=greatest(coalesce(free_lifetime_generations_used,0)-1,0)
  WHERE id=p_user_id;
 ELSIF r.entitlement_type='pack_credit' THEN
  UPDATE profiles SET pack_credits=coalesce(pack_credits,0)+1 WHERE id=p_user_id
  RETURNING pack_credits INTO balance;
  INSERT INTO credit_ledger(user_id,type,delta,balance_after,metadata)
  VALUES(p_user_id,'refund',1,balance,jsonb_build_object('source','listing_model_photos',
    'reservation_id',r.id,'job_id',j.id,'reason','photo_terminal_source_failure'));
 END IF;
 IF r.counted_day AND r.day_rate_key IS NOT NULL THEN
  UPDATE rate_limits SET count=greatest(coalesce(count,0)-1,0),updated_at=now()
  WHERE key=r.day_rate_key AND user_id=p_user_id;
 END IF;
 -- Existing free-trial IP resolution triggers also run on this status change.
 UPDATE generation_reservations SET status='refunded',refunded_at=now(),
   refund_reason='photo_terminal_source_failure' WHERE id=r.id;
 RETURN jsonb_build_object('released',true,'reservationId',r.id,
   'monthlyRestored',r.counted_month AND same_period,'dailyRestored',r.counted_day);
END $$;
REVOKE ALL ON FUNCTION public.release_unused_photo_source_allowance(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_unused_photo_source_allowance(uuid,uuid) TO service_role;

CREATE FUNCTION public.return_terminal_photo_source_allowance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM release_unused_photo_source_allowance(NEW.user_id,NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.return_terminal_photo_source_allowance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER return_terminal_photo_source_allowance AFTER UPDATE ON public.listing_photo_jobs
FOR EACH ROW WHEN (NEW.state='failed' AND NEW.retry_count>=1)
EXECUTE FUNCTION public.return_terminal_photo_source_allowance();

COMMIT;
