-- Credit system migration
-- Adds credit balances, legacy flag, free drip tracking, and credit transaction log.

-- ─── profiles additions ───────────────────────────────────────────────────────

-- Two credit pools
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pack_credits INTEGER NOT NULL DEFAULT 0;

-- Rollover amount (portion of subscription_credits from previous cycles — display only)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rollover_credits INTEGER NOT NULL DEFAULT 0;

-- When the current subscription cycle ends (NULL for free/pack-only users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_cycle_end TIMESTAMP WITH TIME ZONE;

-- Flag: TRUE = use legacy daily/monthly rate-limiting; FALSE = use credit system
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_legacy_plan BOOLEAN NOT NULL DEFAULT FALSE;

-- Free drip state (one-time per account, never resets)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_drip_weeks_delivered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_drip_started_at TIMESTAMP WITH TIME ZONE;

-- Phone upload counter for free-tier monthly limit (5/mo)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_uploads_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_phone_upload_reset TIMESTAMP WITH TIME ZONE;

-- ─── Backfill ─────────────────────────────────────────────────────────────────

-- Mark current active paid subscribers as legacy (keeps their daily/monthly limits unchanged)
UPDATE profiles
SET is_legacy_plan = TRUE
WHERE subscription_status = 'active'
  AND subscription_tier IN ('starter', 'unlimited_monthly', 'pro', 'business');

-- Bootstrap the free credit system for all non-legacy users:
-- give 5 signup credits and start the drip clock from now.
UPDATE profiles
SET
  subscription_credits = 5,
  free_drip_started_at = NOW(),
  free_drip_weeks_delivered = 0
WHERE is_legacy_plan = FALSE
  AND free_drip_started_at IS NULL;

-- ─── credit_transactions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_transactions (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount                      INTEGER NOT NULL,          -- positive = added, negative = consumed
  balance_after               INTEGER NOT NULL,          -- total (sub + pack) after
  subscription_credits_after  INTEGER NOT NULL,
  pack_credits_after          INTEGER NOT NULL,
  type                        TEXT NOT NULL CHECK (type IN (
    'signup_bonus',
    'weekly_drip',
    'subscription_renewal',
    'pack_purchase',
    'generation',
    'rollover_bank',
    'rollover_trim',
    'expiry',
    'admin_adjustment',
    'subscription_cancel'
  )),
  metadata                    JSONB NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON credit_transactions (user_id, created_at DESC);
