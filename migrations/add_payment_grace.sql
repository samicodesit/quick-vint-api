-- Payment grace period, rollover freeze, and downgrade scheduling columns.
-- Also extends credit_transactions type constraint for new transaction kinds.

-- ─── profiles additions ───────────────────────────────────────────────────────

-- Set when the first payment failure occurs; cleared on recovery or final downgrade.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_grace_started_at TIMESTAMP WITH TIME ZONE;

-- Set when a failed-payment downgrade fires; rollover is recoverable until this date.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rollover_frozen_until TIMESTAMP WITH TIME ZONE;

-- Stores the target tier for a scheduled downgrade (applied at next billing cycle).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_tier TEXT;

-- Prevents sending the day-5 payment-failure reminder more than once.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_day5_email_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── credit_transactions type check extension ─────────────────────────────────

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

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
