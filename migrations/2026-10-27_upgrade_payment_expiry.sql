BEGIN;

-- Only unpaid plan-change protection sets this. Existing customers are untouched.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paid_access_expires_at timestamptz;

CREATE OR REPLACE FUNCTION protect_billing_access_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF (TG_OP = 'INSERT' AND NEW.paid_access_expires_at IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.paid_access_expires_at IS DISTINCT FROM OLD.paid_access_expires_at) THEN
      RAISE EXCEPTION 'billing access expiry is managed by the server';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_billing_access_expiry ON profiles;
CREATE TRIGGER protect_billing_access_expiry BEFORE INSERT OR UPDATE OF paid_access_expires_at ON profiles
FOR EACH ROW EXECUTE FUNCTION protect_billing_access_expiry();

CREATE OR REPLACE FUNCTION reserve_generation_request_for_current_status(
  p_user_id uuid, p_pricing_limits_mode text, p_effective_tier text,
  p_monthly_limit integer, p_daily_limit integer, p_burst_limit integer,
  p_free_lifetime_limit integer, p_has_unlimited_daily boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  profile_status text;
  profile_tier text;
  protected_access_end timestamptz;
BEGIN
  SELECT subscription_status, subscription_tier, paid_access_expires_at
  INTO profile_status, profile_tier, protected_access_end
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF profile_status IN ('past_due', 'unpaid')
    OR (protected_access_end IS NOT NULL AND protected_access_end <= now()) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'code', 'payment_required',
      'currentTier', COALESCE(profile_tier, p_effective_tier),
      'error', 'Payment for your subscription is overdue. Update your payment method to continue.'
    );
  END IF;

  RETURN reserve_generation_request(p_user_id, p_pricing_limits_mode,
    p_effective_tier, p_monthly_limit, p_daily_limit, p_burst_limit,
    p_free_lifetime_limit, p_has_unlimited_daily);
END;
$$;

REVOKE ALL ON FUNCTION reserve_generation_request_for_current_status(uuid,text,text,integer,integer,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_generation_request_for_current_status(uuid,text,text,integer,integer,integer,integer,boolean) TO service_role;

COMMIT;
