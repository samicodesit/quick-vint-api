BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS subscription_welcome_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('starter', 'pro', 'business')),
  template_key text NOT NULL,
  stripe_subscription_id text NOT NULL,
  stripe_checkout_session_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  resend_email_id text,
  last_error text,
  locked_until timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE subscription_welcome_emails ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_welcome_emails_once
  ON subscription_welcome_emails (stripe_subscription_id, template_key);

CREATE INDEX IF NOT EXISTS idx_subscription_welcome_emails_retry
  ON subscription_welcome_emails (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_subscription_welcome_emails_user_created
  ON subscription_welcome_emails (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMIT;
