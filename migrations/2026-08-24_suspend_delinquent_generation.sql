BEGIN;

CREATE OR REPLACE FUNCTION reserve_generation_request_for_current_status(
  p_user_id uuid,
  p_pricing_limits_mode text,
  p_effective_tier text,
  p_monthly_limit integer,
  p_daily_limit integer,
  p_burst_limit integer,
  p_free_lifetime_limit integer,
  p_has_unlimited_daily boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_status text;
  profile_tier text;
BEGIN
  SELECT subscription_status, subscription_tier
  INTO profile_status, profile_tier
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF profile_status IN ('past_due', 'unpaid') THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'payment_required',
      'currentTier', COALESCE(profile_tier, p_effective_tier),
      'error', 'Payment for your subscription is overdue. Update your payment method to continue.'
    );
  END IF;

  RETURN reserve_generation_request(
    p_user_id,
    p_pricing_limits_mode,
    p_effective_tier,
    p_monthly_limit,
    p_daily_limit,
    p_burst_limit,
    p_free_lifetime_limit,
    p_has_unlimited_daily
  );
END;
$$;

REVOKE ALL ON FUNCTION reserve_generation_request_for_current_status(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION reserve_generation_request_for_current_status(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  boolean
) TO service_role;

COMMIT;
