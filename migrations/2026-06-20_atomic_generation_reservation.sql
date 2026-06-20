BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS generation_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committed', 'refunded')),
  entitlement_type text NOT NULL CHECK (entitlement_type IN ('plan', 'free_lifetime', 'pack_credit')),
  counted_month boolean NOT NULL DEFAULT false,
  counted_day boolean NOT NULL DEFAULT false,
  day_rate_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE generation_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_generation_reservations_user_created
  ON generation_reservations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_reservations_status_created
  ON generation_reservations (status, created_at);

CREATE OR REPLACE FUNCTION reserve_generation_request(
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
  profile_row profiles%ROWTYPE;
  custom_daily_limit integer;
  effective_daily_limit integer;
  minute_key text;
  day_key text;
  today_key text;
  minute_rate_id integer;
  day_rate_id integer;
  minute_count integer := 0;
  day_count integer := 0;
  free_used integer := 0;
  free_remaining integer := 0;
  pack_balance integer := 0;
  month_used integer := 0;
  now_utc timestamptz := timezone('utc', now());
  minute_expiry timestamptz;
  day_expiry timestamptz;
  new_pack_balance integer;
  emergency_enabled text;
  daily_cost numeric := 0;
  global_daily_budget numeric := 100;
  openai_cost_per_request numeric := 0.0201;
  reservation_id uuid;
  entitlement_type text := 'plan';
  counted_day boolean := false;
BEGIN
  SELECT *
  INTO profile_row
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'service_unavailable',
      'limitScope', 'service',
      'error', 'Could not retrieve profile.'
    );
  END IF;

  SELECT value
  INTO emergency_enabled
  FROM system_settings
  WHERE key = 'emergency_brake';

  IF emergency_enabled = 'true' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'service_unavailable',
      'limitScope', 'service',
      'error', 'Service temporarily unavailable. Please try again later.'
    );
  END IF;

  today_key := to_char(now_utc, 'YYYY-MM-DD');

  SELECT COALESCE(estimated_cost, 0)
  INTO daily_cost
  FROM daily_stats
  WHERE date = today_key;

  IF COALESCE(daily_cost, 0) >= global_daily_budget THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'service_unavailable',
      'limitScope', 'service',
      'error', 'Service temporarily unavailable due to daily budget limits. Please try again later.'
    );
  END IF;

  minute_key := 'rate_limit:' || p_user_id || ':minute:' ||
    EXTRACT(YEAR FROM now_utc)::int || '-' ||
    (EXTRACT(MONTH FROM now_utc)::int - 1) || '-' ||
    EXTRACT(DAY FROM now_utc)::int || '-' ||
    EXTRACT(HOUR FROM now_utc)::int || '-' ||
    EXTRACT(MINUTE FROM now_utc)::int;

  day_key := 'rate_limit:' || p_user_id || ':day:' ||
    EXTRACT(YEAR FROM now_utc)::int || '-' ||
    (EXTRACT(MONTH FROM now_utc)::int - 1) || '-' ||
    EXTRACT(DAY FROM now_utc)::int;

  minute_expiry := date_trunc('minute', now_utc) + interval '1 minute';
  day_expiry := date_trunc('day', now_utc) + interval '1 day';

  SELECT id, COALESCE(count, 0)
  INTO minute_rate_id, minute_count
  FROM rate_limits
  WHERE key = minute_key
    AND user_id = p_user_id
  ORDER BY count DESC, id ASC
  LIMIT 1
  FOR UPDATE;

  minute_count := COALESCE(minute_count, 0);

  IF minute_count >= p_burst_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'burst_limit',
      'currentTier', p_effective_tier,
      'limitScope', 'minute',
      'currentLimit', p_burst_limit,
      'error', 'Too many requests. Please wait a moment before trying again.'
    );
  END IF;

  free_used := GREATEST(COALESCE(profile_row.free_lifetime_generations_used, 0), 0);
  pack_balance := GREATEST(COALESCE(profile_row.pack_credits, 0), 0);
  month_used := GREATEST(COALESCE(profile_row.api_calls_this_month, 0), 0);

  IF p_pricing_limits_mode = 'current' AND p_effective_tier = 'free' THEN
    free_remaining := GREATEST(p_free_lifetime_limit - free_used, 0);

    IF free_remaining <= 0 AND pack_balance <= 0 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'code', 'free_lifetime_limit',
        'currentTier', 'free',
        'limitScope', 'month',
        'currentLimit', p_free_lifetime_limit,
        'error', 'Free listing limit reached. Upgrade your plan or buy a one-time credit pack.'
      );
    END IF;

    IF free_remaining > 0 THEN
      entitlement_type := 'free_lifetime';

      UPDATE profiles
      SET
        free_lifetime_generations_used = free_used + 1,
        api_calls_this_month = month_used + 1
      WHERE id = p_user_id;
    ELSE
      entitlement_type := 'pack_credit';

      UPDATE profiles
      SET
        pack_credits = pack_balance - 1,
        api_calls_this_month = month_used + 1
      WHERE id = p_user_id
      RETURNING pack_credits INTO new_pack_balance;

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
        COALESCE(new_pack_balance, 0),
        jsonb_build_object('source', 'api_generate', 'reservation', true)
      );
    END IF;

    IF minute_rate_id IS NULL THEN
      INSERT INTO rate_limits (
        key,
        user_id,
        count,
        window_type,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        minute_key,
        p_user_id,
        1,
        'minute',
        minute_expiry,
        now_utc,
        now_utc
      );
    ELSE
      UPDATE rate_limits
      SET
        count = minute_count + 1,
        expires_at = COALESCE(expires_at, minute_expiry),
        updated_at = now_utc
      WHERE id = minute_rate_id;
    END IF;

    INSERT INTO daily_stats (
      date,
      total_api_calls,
      estimated_cost,
      created_at,
      updated_at
    )
    VALUES (
      today_key,
      1,
      openai_cost_per_request,
      now_utc,
      now_utc
    )
    ON CONFLICT (date)
    DO UPDATE SET
      total_api_calls = COALESCE(daily_stats.total_api_calls, 0) + 1,
      estimated_cost = COALESCE(daily_stats.estimated_cost, 0) + openai_cost_per_request,
      updated_at = now_utc;

    INSERT INTO generation_reservations (
      user_id,
      entitlement_type,
      counted_month,
      counted_day,
      day_rate_key,
      metadata
    )
    VALUES (
      p_user_id,
      entitlement_type,
      true,
      false,
      NULL,
      jsonb_build_object(
        'pricingLimitsMode', p_pricing_limits_mode,
        'tier', p_effective_tier,
        'reservedAt', now_utc
      )
    )
    RETURNING id INTO reservation_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'reservationId', reservation_id,
      'remainingRequests', jsonb_build_object(
        'minute', GREATEST(p_burst_limit - minute_count - 1, 0),
        'day', NULL,
        'month', 0,
        'freeLifetime', GREATEST(free_remaining - 1, 0),
        'packCredits', CASE WHEN free_remaining > 0 THEN pack_balance ELSE GREATEST(pack_balance - 1, 0) END
      )
    );
  END IF;

  SELECT id, COALESCE(count, 0)
  INTO day_rate_id, day_count
  FROM rate_limits
  WHERE key = day_key
    AND user_id = p_user_id
  ORDER BY count DESC, id ASC
  LIMIT 1
  FOR UPDATE;

  day_count := COALESCE(day_count, 0);
  effective_daily_limit := p_daily_limit;

  IF profile_row.custom_daily_limit IS NOT NULL
    AND profile_row.custom_limit_expires_at IS NOT NULL
    AND profile_row.custom_limit_expires_at > now()
  THEN
    effective_daily_limit := profile_row.custom_daily_limit;
  END IF;

  IF month_used >= p_monthly_limit THEN
    IF pack_balance <= 0 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'code', 'monthly_limit',
        'currentTier', p_effective_tier,
        'limitScope', 'month',
        'currentLimit', p_monthly_limit,
        'error', 'Monthly usage limit reached. Please upgrade your plan or try again next month.'
      );
    END IF;
  ELSIF NOT p_has_unlimited_daily
    AND effective_daily_limit IS NOT NULL
    AND day_count >= effective_daily_limit
  THEN
    IF pack_balance <= 0 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'code', 'daily_limit',
        'currentTier', p_effective_tier,
        'limitScope', 'day',
        'currentLimit', effective_daily_limit,
        'error', 'Daily usage limit reached. Please try again tomorrow or upgrade your plan.'
      );
    END IF;
  END IF;

  IF month_used >= p_monthly_limit
    OR (
      NOT p_has_unlimited_daily
      AND effective_daily_limit IS NOT NULL
      AND day_count >= effective_daily_limit
    )
  THEN
    entitlement_type := 'pack_credit';

    UPDATE profiles
    SET
      pack_credits = pack_balance - 1,
      api_calls_this_month = month_used + 1
    WHERE id = p_user_id
    RETURNING pack_credits INTO new_pack_balance;

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
      COALESCE(new_pack_balance, 0),
      jsonb_build_object('source', 'api_generate', 'over_plan_top_up', true, 'reservation', true)
    );
  ELSE
    entitlement_type := 'plan';

    UPDATE profiles
    SET api_calls_this_month = month_used + 1
    WHERE id = p_user_id;
  END IF;

  IF minute_rate_id IS NULL THEN
    INSERT INTO rate_limits (
      key,
      user_id,
      count,
      window_type,
      expires_at,
      created_at,
      updated_at
    )
    VALUES (
      minute_key,
      p_user_id,
      1,
      'minute',
      minute_expiry,
      now_utc,
      now_utc
    );
  ELSE
    UPDATE rate_limits
    SET
      count = minute_count + 1,
      expires_at = COALESCE(expires_at, minute_expiry),
      updated_at = now_utc
    WHERE id = minute_rate_id;
  END IF;

  IF NOT p_has_unlimited_daily THEN
    IF day_rate_id IS NULL THEN
      INSERT INTO rate_limits (
        key,
        user_id,
        count,
        window_type,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        day_key,
        p_user_id,
        1,
        'day',
        day_expiry,
        now_utc,
        now_utc
      );
    ELSE
      UPDATE rate_limits
      SET
        count = day_count + 1,
        expires_at = COALESCE(expires_at, day_expiry),
        updated_at = now_utc
      WHERE id = day_rate_id;
    END IF;

    counted_day := true;
  END IF;

  INSERT INTO daily_stats (
    date,
    total_api_calls,
    estimated_cost,
    created_at,
    updated_at
  )
  VALUES (
    today_key,
    1,
    openai_cost_per_request,
    now_utc,
    now_utc
  )
  ON CONFLICT (date)
  DO UPDATE SET
    total_api_calls = COALESCE(daily_stats.total_api_calls, 0) + 1,
    estimated_cost = COALESCE(daily_stats.estimated_cost, 0) + openai_cost_per_request,
    updated_at = now_utc;

  INSERT INTO generation_reservations (
    user_id,
    entitlement_type,
    counted_month,
    counted_day,
    day_rate_key,
    metadata
  )
  VALUES (
    p_user_id,
    entitlement_type,
    true,
    counted_day,
    CASE WHEN counted_day THEN day_key ELSE NULL END,
    jsonb_build_object(
      'pricingLimitsMode', p_pricing_limits_mode,
      'tier', p_effective_tier,
      'reservedAt', now_utc
    )
  )
  RETURNING id INTO reservation_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reservationId', reservation_id,
    'remainingRequests', jsonb_build_object(
      'minute', GREATEST(p_burst_limit - minute_count - 1, 0),
      'day', CASE
        WHEN p_has_unlimited_daily OR effective_daily_limit IS NULL THEN NULL
        ELSE GREATEST(effective_daily_limit - day_count - 1, 0)
      END,
      'month', GREATEST(p_monthly_limit - month_used - 1, 0),
      'packCredits', CASE
        WHEN month_used >= p_monthly_limit
          OR (
            NOT p_has_unlimited_daily
            AND effective_daily_limit IS NOT NULL
            AND day_count >= effective_daily_limit
          )
        THEN GREATEST(pack_balance - 1, 0)
        ELSE pack_balance
      END
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION commit_generation_reservation(
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE generation_reservations
  SET
    status = 'committed',
    committed_at = COALESCE(committed_at, timezone('utc', now()))
  WHERE id = p_reservation_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION refund_generation_reservation(
  p_reservation_id uuid,
  p_reason text DEFAULT 'generation_failed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation_row generation_reservations%ROWTYPE;
  new_pack_balance integer;
BEGIN
  SELECT *
  INTO reservation_row
  FROM generation_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR reservation_row.status <> 'pending' THEN
    RETURN false;
  END IF;

  IF reservation_row.counted_month THEN
    UPDATE profiles
    SET api_calls_this_month = GREATEST(COALESCE(api_calls_this_month, 0) - 1, 0)
    WHERE id = reservation_row.user_id;
  END IF;

  IF reservation_row.entitlement_type = 'free_lifetime' THEN
    UPDATE profiles
    SET free_lifetime_generations_used = GREATEST(COALESCE(free_lifetime_generations_used, 0) - 1, 0)
    WHERE id = reservation_row.user_id;
  ELSIF reservation_row.entitlement_type = 'pack_credit' THEN
    UPDATE profiles
    SET pack_credits = COALESCE(pack_credits, 0) + 1
    WHERE id = reservation_row.user_id
    RETURNING pack_credits INTO new_pack_balance;

    INSERT INTO credit_ledger (
      user_id,
      type,
      delta,
      balance_after,
      metadata
    )
    VALUES (
      reservation_row.user_id,
      'refund',
      1,
      COALESCE(new_pack_balance, 0),
      jsonb_build_object(
        'source', 'api_generate',
        'reservation_id', p_reservation_id,
        'reason', COALESCE(p_reason, 'generation_failed')
      )
    );
  END IF;

  IF reservation_row.counted_day AND reservation_row.day_rate_key IS NOT NULL THEN
    UPDATE rate_limits
    SET
      count = GREATEST(COALESCE(count, 0) - 1, 0),
      updated_at = timezone('utc', now())
    WHERE key = reservation_row.day_rate_key
      AND user_id = reservation_row.user_id;
  END IF;

  UPDATE generation_reservations
  SET
    status = 'refunded',
    refunded_at = timezone('utc', now()),
    refund_reason = COALESCE(p_reason, 'generation_failed')
  WHERE id = p_reservation_id;

  RETURN true;
END;
$$;

COMMIT;
