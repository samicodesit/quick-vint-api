-- Fixes audit findings on the pricing-overhaul implementation:
--   1. CHECK constraint missing 3 transaction types (upgrade_proration,
--      rollover_freeze, rollover_expiry) — these inserts were failing silently.
--   2. Stripe webhook event idempotency table (prevents double-credit on
--      retry: pack purchases, renewals, cancellations).
--   3. Atomic credit-deduction RPCs to close the read-then-write race
--      window in consumeCredit and addPackCredits.

-- ─── 1. credit_transactions CHECK constraint ─────────────────────────────────

ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup_bonus',
    'weekly_drip',
    'subscription_renewal',
    'pack_purchase',
    'generation',
    'rollover_bank',
    'rollover_trim',
    'expiry',
    'admin_adjustment',
    'subscription_cancel',
    'upgrade_proration',
    'rollover_freeze',
    'rollover_expiry'
  ));

-- ─── 2. Stripe webhook event dedup ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_processed_at
  ON processed_stripe_events (processed_at DESC);

-- ─── 3. Atomic credit operations ─────────────────────────────────────────────

-- Deducts one credit (sub first, pack last) atomically. Returns the new
-- balance, or NULL if the user has no credits left.
CREATE OR REPLACE FUNCTION consume_credit_atomic(p_user_id UUID)
RETURNS TABLE (
  subscription_credits INTEGER,
  rollover_credits     INTEGER,
  pack_credits         INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE profiles AS p
  SET
    subscription_credits = CASE WHEN p.subscription_credits > 0
                                THEN p.subscription_credits - 1
                                ELSE p.subscription_credits END,
    pack_credits         = CASE WHEN p.subscription_credits <= 0 AND p.pack_credits > 0
                                THEN p.pack_credits - 1
                                ELSE p.pack_credits END
  WHERE p.id = p_user_id
    AND (p.subscription_credits > 0 OR p.pack_credits > 0)
  RETURNING p.subscription_credits, p.rollover_credits, p.pack_credits;
END;
$$ LANGUAGE plpgsql;

-- Atomically adds N permanent pack credits.
CREATE OR REPLACE FUNCTION add_pack_credits_atomic(p_user_id UUID, p_amount INTEGER)
RETURNS TABLE (
  subscription_credits INTEGER,
  pack_credits         INTEGER
) AS $$
BEGIN
  UPDATE profiles
  SET pack_credits = pack_credits + p_amount
  WHERE id = p_user_id;

  RETURN QUERY
    SELECT p.subscription_credits, p.pack_credits
    FROM profiles p WHERE p.id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Atomically increments phone_uploads_this_month with monthly auto-reset.
-- Returns the new counter value.
CREATE OR REPLACE FUNCTION consume_phone_upload_atomic(
  p_user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_last  TIMESTAMP WITH TIME ZONE;
  v_now   TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  SELECT phone_uploads_this_month, last_phone_upload_reset
    INTO v_count, v_last
    FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_last IS NULL OR date_trunc('month', v_last) <> date_trunc('month', v_now) THEN
    v_count := 0;
    v_last  := v_now;
  END IF;

  v_count := v_count + 1;

  UPDATE profiles
    SET phone_uploads_this_month = v_count,
        last_phone_upload_reset  = v_last
    WHERE id = p_user_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
