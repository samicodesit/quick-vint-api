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

CREATE OR REPLACE FUNCTION reserve_subscription_welcome_email(
  p_user_id uuid,
  p_email text,
  p_tier text,
  p_template_key text,
  p_stripe_subscription_id text,
  p_stripe_checkout_session_id text,
  p_idempotency_key text
)
RETURNS TABLE (
  id uuid,
  should_send boolean,
  idempotency_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_record subscription_welcome_emails%ROWTYPE;
BEGIN
  INSERT INTO subscription_welcome_emails (
    user_id,
    email,
    tier,
    template_key,
    stripe_subscription_id,
    stripe_checkout_session_id,
    idempotency_key,
    status,
    attempts,
    locked_until,
    next_attempt_at
  )
  VALUES (
    p_user_id,
    p_email,
    p_tier,
    p_template_key,
    p_stripe_subscription_id,
    p_stripe_checkout_session_id,
    p_idempotency_key,
    'sending',
    1,
    timezone('utc', now()) + interval '10 minutes',
    NULL
  )
  ON CONFLICT (stripe_subscription_id, template_key) DO NOTHING
  RETURNING * INTO row_record;

  IF FOUND THEN
    RETURN QUERY SELECT row_record.id, true, row_record.idempotency_key;
    RETURN;
  END IF;

  SELECT *
  INTO row_record
  FROM subscription_welcome_emails swe
  WHERE swe.stripe_subscription_id = p_stripe_subscription_id
    AND swe.template_key = p_template_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, p_idempotency_key;
    RETURN;
  END IF;

  IF row_record.status = 'sent' THEN
    RETURN QUERY SELECT row_record.id, false, COALESCE(row_record.idempotency_key, p_idempotency_key);
    RETURN;
  END IF;

  IF row_record.status = 'sending'
    AND row_record.locked_until IS NOT NULL
    AND row_record.locked_until > timezone('utc', now())
  THEN
    RETURN QUERY SELECT row_record.id, false, row_record.idempotency_key;
    RETURN;
  END IF;

  UPDATE subscription_welcome_emails swe
  SET
    status = 'sending',
    attempts = row_record.attempts + 1,
    locked_until = timezone('utc', now()) + interval '10 minutes',
    next_attempt_at = NULL,
    last_error = NULL,
    updated_at = timezone('utc', now())
  WHERE swe.id = row_record.id
  RETURNING * INTO row_record;

  RETURN QUERY SELECT row_record.id, true, row_record.idempotency_key;
END;
$$;

COMMIT;
