BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_usage_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS last_usage_reset_invoice_id text;

-- Existing active subscriptions have already paid for their current period.
-- Do not backfill past_due: their current invoice may still need to reset usage
-- after Stripe successfully recovers the payment.
UPDATE profiles
SET last_usage_period_end = current_period_end
WHERE last_usage_period_end IS NULL
  AND current_period_end IS NOT NULL
  AND subscription_status IN ('active', 'trialing', 'canceling')
  AND COALESCE(subscription_tier, 'free') <> 'free';

CREATE OR REPLACE FUNCTION reset_monthly_usage_for_paid_invoice(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_invoice_id text,
  p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_subscription_id text;
  previous_period_end timestamptz;
BEGIN
  IF p_user_id IS NULL
    OR NULLIF(BTRIM(p_stripe_subscription_id), '') IS NULL
    OR NULLIF(BTRIM(p_stripe_invoice_id), '') IS NULL
    OR p_period_end IS NULL
  THEN
    RAISE EXCEPTION 'paid invoice usage reset requires complete input';
  END IF;

  SELECT stripe_subscription_id, last_usage_period_end
  INTO profile_subscription_id, previous_period_end
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF profile_subscription_id IS DISTINCT FROM p_stripe_subscription_id THEN
    RETURN jsonb_build_object(
      'reset', false,
      'reason', 'subscription_mismatch'
    );
  END IF;

  IF previous_period_end IS NOT NULL AND p_period_end <= previous_period_end THEN
    RETURN jsonb_build_object(
      'reset', false,
      'reason', 'duplicate_or_stale_period'
    );
  END IF;

  UPDATE profiles
  SET
    api_calls_this_month = 0,
    last_api_call_reset = now(),
    last_usage_period_end = p_period_end,
    last_usage_reset_invoice_id = p_stripe_invoice_id
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'reset', true,
    'reason', 'new_paid_period'
  );
END;
$$;

REVOKE ALL ON FUNCTION reset_monthly_usage_for_paid_invoice(
  uuid,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION reset_monthly_usage_for_paid_invoice(
  uuid,
  text,
  text,
  timestamptz
) TO service_role;

COMMIT;
