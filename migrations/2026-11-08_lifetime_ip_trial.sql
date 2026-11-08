BEGIN;

CREATE TABLE public.free_trial_ip_usage (
  ip_key text PRIMARY KEY CHECK (ip_key ~ '^[0-9a-f]{64}$'),
  used integer NOT NULL CHECK (used BETWEEN 0 AND 5)
);
ALTER TABLE public.free_trial_ip_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_trial_ip_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.free_trial_ip_usage TO service_role;

-- Keep the link to a reservation only while it can still be refunded.
ALTER TABLE public.generation_reservations ADD COLUMN free_trial_ip_key text;

-- Only the server's service-role PostgREST request carries this key.
CREATE FUNCTION public.request_free_trial_ip_key() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT NULLIF(current_setting('request.headers', true), '')::jsonb
    ->> 'x-autolister-free-trial-ip'
$$;
REVOKE ALL ON FUNCTION public.request_free_trial_ip_key() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.track_free_trial_ip_reservation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE trial_ip text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'refunded' THEN
      UPDATE free_trial_ip_usage SET used = used - 1
      WHERE ip_key = OLD.free_trial_ip_key AND used > 0;
    END IF;
    NEW.free_trial_ip_key := NULL;
    RETURN NEW;
  END IF;

  trial_ip := request_free_trial_ip_key();
  IF trial_ip IS NULL OR EXISTS (
    SELECT 1 FROM profiles WHERE id = NEW.user_id AND (
      subscription_status IN ('active','trialing','canceling','past_due')
      OR paid_access_expires_at > now()
    )
  ) THEN RETURN NEW; END IF;
  IF trial_ip !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P5IP2', MESSAGE = 'free_trial_ip_unavailable';
  END IF;

  -- Insertion has already locked the profile through its foreign key.
  INSERT INTO free_trial_ip_usage (ip_key, used) VALUES (trial_ip, 1)
  ON CONFLICT (ip_key) DO UPDATE SET used = free_trial_ip_usage.used + 1
  WHERE free_trial_ip_usage.used < 5;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P5IP1', MESSAGE = 'free_trial_ip_limit';
  END IF;

  UPDATE generation_reservations SET free_trial_ip_key = trial_ip WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_free_trial_ip_reservation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER track_free_trial_ip_insert
AFTER INSERT ON public.generation_reservations
FOR EACH ROW WHEN (NEW.entitlement_type = 'free_lifetime' AND NEW.status = 'pending')
EXECUTE FUNCTION public.track_free_trial_ip_reservation();

CREATE TRIGGER track_free_trial_ip_resolution
BEFORE UPDATE OF status ON public.generation_reservations
FOR EACH ROW WHEN (
  OLD.free_trial_ip_key IS NOT NULL
  AND OLD.status = 'pending'
  AND NEW.status IN ('committed', 'refunded')
)
EXECUTE FUNCTION public.track_free_trial_ip_reservation();

CREATE OR REPLACE FUNCTION public.reserve_generation_request_for_current_status(
  p_user_id uuid, p_pricing_limits_mode text, p_effective_tier text,
  p_monthly_limit integer, p_daily_limit integer, p_burst_limit integer,
  p_free_lifetime_limit integer, p_has_unlimited_daily boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  profile_status text;
  profile_tier text;
  protected_access_end timestamptz;
  text_cost numeric;
  free_used integer;
  paid_credits integer;
  trial_ip text := request_free_trial_ip_key();
  ip_used integer := 5;
  outcome jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(901129);
  SELECT coalesce(estimated_cost,0) INTO text_cost FROM daily_stats WHERE date=current_date::text;
  IF coalesce(text_cost,0)+listing_photo_daily_cost()+0.0201>100 THEN
    RETURN jsonb_build_object('allowed',false,'code','service_unavailable','limitScope','service');
  END IF;

  SELECT subscription_status, subscription_tier, paid_access_expires_at,
    coalesce(free_lifetime_generations_used, 0), coalesce(pack_credits, 0)
  INTO profile_status, profile_tier, protected_access_end, free_used, paid_credits
  FROM profiles WHERE id=p_user_id FOR UPDATE;
  IF profile_status IN ('past_due','unpaid') OR (protected_access_end IS NOT NULL AND protected_access_end<=now()) THEN
    RETURN jsonb_build_object('allowed',false,'code','payment_required','currentTier',coalesce(profile_tier,p_effective_tier),'error','Payment for your subscription is overdue. Update your payment method to continue.');
  END IF;

  IF trial_ip IS NOT NULL AND p_effective_tier = 'free'
    AND coalesce(profile_status, 'free') NOT IN ('active','trialing','canceling')
    AND protected_access_end IS NULL THEN
    IF trial_ip ~ '^[0-9a-f]{64}$' THEN
      INSERT INTO free_trial_ip_usage (ip_key, used) VALUES (trial_ip, 0)
      ON CONFLICT (ip_key) DO NOTHING;
      SELECT used INTO ip_used FROM free_trial_ip_usage WHERE ip_key = trial_ip FOR UPDATE;
    ELSIF coalesce(paid_credits, 0) = 0 THEN
      RETURN jsonb_build_object('allowed',false,'code','service_unavailable','limitScope','service');
    END IF;
    p_pricing_limits_mode := 'current';
    -- When the IP cap is reached, the existing reservation can still use credits.
    p_free_lifetime_limit := least(p_free_lifetime_limit, free_used + (5 - ip_used));
  END IF;

  outcome := reserve_generation_request(p_user_id,p_pricing_limits_mode,p_effective_tier,p_monthly_limit,p_daily_limit,p_burst_limit,p_free_lifetime_limit,p_has_unlimited_daily);
  IF trial_ip IS NOT NULL AND outcome->>'code' = 'free_lifetime_limit' THEN
    outcome := outcome || jsonb_build_object('currentLimit', 5);
  END IF;
  RETURN outcome;
END;
$$;

COMMIT;
