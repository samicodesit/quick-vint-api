-- Pricing entitlement migration for the 2026-06 limit rework.
-- Safe to re-run: all schema changes are IF NOT EXISTS or idempotent updates.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS free_lifetime_generations_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_limits_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_limits_reason text,
  ADD COLUMN IF NOT EXISTS is_legacy_plan boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollover_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_credits integer NOT NULL DEFAULT 0;

UPDATE profiles
SET
  free_lifetime_generations_used = COALESCE(free_lifetime_generations_used, 0),
  is_legacy_plan = COALESCE(is_legacy_plan, false),
  pack_credits = COALESCE(pack_credits, 0),
  rollover_credits = COALESCE(rollover_credits, 0),
  subscription_credits = COALESCE(subscription_credits, 0)
WHERE
  free_lifetime_generations_used IS NULL
  OR is_legacy_plan IS NULL
  OR pack_credits IS NULL
  OR rollover_credits IS NULL
  OR subscription_credits IS NULL;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_session_id text UNIQUE,
  type text NOT NULL CHECK (type IN ('purchase', 'consume', 'refund', 'adjustment')),
  delta integer NOT NULL,
  balance_after integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id_created_at
  ON credit_ledger (user_id, created_at DESC);

-- Free is now 5 lifetime successful generations. Seed from historical 200 logs.
WITH successful_generations AS (
  SELECT user_id, COUNT(*)::integer AS success_count
  FROM api_logs
  WHERE response_status = 200
    AND user_id IS NOT NULL
  GROUP BY user_id
)
UPDATE profiles p
SET free_lifetime_generations_used = LEAST(
  COALESCE(s.success_count, 0),
  5
)
FROM successful_generations s
WHERE p.id = s.user_id
  AND COALESCE(p.subscription_tier, 'free') = 'free';

UPDATE profiles p
SET free_lifetime_generations_used = 0
WHERE COALESCE(p.subscription_tier, 'free') = 'free'
  AND NOT EXISTS (
    SELECT 1
    FROM api_logs l
    WHERE l.user_id = p.id
      AND l.response_status = 200
  );

-- Every paid active subscriber at migration time keeps old limits.
UPDATE profiles
SET
  is_legacy_plan = true,
  legacy_limits_granted_at = COALESCE(legacy_limits_granted_at, now()),
  legacy_limits_reason = COALESCE(
    legacy_limits_reason,
    'active subscriber before 2026-06 pricing limits migration'
  )
WHERE subscription_status = 'active'
  AND COALESCE(subscription_tier, 'free') <> 'free';

CREATE OR REPLACE FUNCTION grant_credit_pack(
  p_user_id uuid,
  p_stripe_session_id text,
  p_credits integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
  new_balance integer;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'p_credits must be positive';
  END IF;

  INSERT INTO credit_ledger (
    user_id,
    stripe_session_id,
    type,
    delta,
    metadata
  )
  VALUES (
    p_user_id,
    p_stripe_session_id,
    'purchase',
    p_credits,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (stripe_session_id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    SELECT COALESCE(pack_credits, 0)
    INTO new_balance
    FROM profiles
    WHERE id = p_user_id;

    RETURN COALESCE(new_balance, 0);
  END IF;

  UPDATE profiles
  SET pack_credits = COALESCE(pack_credits, 0) + p_credits
  WHERE id = p_user_id
  RETURNING pack_credits INTO new_balance;

  UPDATE credit_ledger
  SET balance_after = new_balance
  WHERE id = inserted_id;

  RETURN COALESCE(new_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION consume_pack_credit(
  p_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
BEGIN
  SELECT COALESCE(pack_credits, 0)
  INTO current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF COALESCE(current_balance, 0) <= 0 THEN
    RETURN false;
  END IF;

  UPDATE profiles
  SET pack_credits = COALESCE(pack_credits, 0) - 1
  WHERE id = p_user_id
  RETURNING pack_credits INTO new_balance;

  INSERT INTO credit_ledger (
    user_id,
    type,
    delta,
    balance_after,
    metadata
  )
  VALUES (
    p_user_id,
    'consume',
    -1,
    new_balance,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN true;
END;
$$;

COMMIT;
