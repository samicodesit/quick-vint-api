BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  user_email text,
  source text NOT NULL CHECK (source IN ('stripe_webhook', 'admin', 'reconciliation')),
  event_type text NOT NULL,
  stripe_event_id text,
  stripe_event_created_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  status text,
  cancel_at_period_end boolean,
  canceled_at timestamptz,
  cancel_at timestamptz,
  current_period_end timestamptz,
  amount_due integer,
  amount_remaining integer,
  currency text,
  attempt_count integer,
  next_payment_attempt timestamptz,
  billing_reason text,
  drift_reasons text[],
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_stripe_event_id
  ON billing_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_user_created
  ON billing_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_email_created
  ON billing_events (lower(user_email), created_at DESC)
  WHERE user_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_customer_created
  ON billing_events (stripe_customer_id, created_at DESC)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_subscription_created
  ON billing_events (stripe_subscription_id, created_at DESC)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_invoice_created
  ON billing_events (stripe_invoice_id, created_at DESC)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_drift_created
  ON billing_events (created_at DESC)
  WHERE source = 'reconciliation' AND drift_reasons IS NOT NULL;

COMMIT;
