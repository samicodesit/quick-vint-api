\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE profiles (
  id uuid PRIMARY KEY
);

CREATE TABLE generation_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'committed', 'refunded')),
  entitlement_type text NOT NULL DEFAULT 'plan',
  counted_month boolean NOT NULL DEFAULT false,
  counted_day boolean NOT NULL DEFAULT false,
  day_rate_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION commit_generation_reservation(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE generation_reservations
  SET status = 'committed', committed_at = COALESCE(committed_at, now())
  WHERE id = p_reservation_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION refund_generation_reservation(
  p_reservation_id uuid,
  p_reason text DEFAULT 'generation_failed'
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE generation_reservations
  SET
    status = 'refunded',
    refunded_at = COALESCE(refunded_at, now()),
    refund_reason = COALESCE(p_reason, 'generation_failed')
  WHERE id = p_reservation_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_generation_request_for_current_status(
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
  reservation_id uuid;
  reservation_owner uuid := p_user_id;
BEGIN
  IF p_effective_tier = 'deny' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'daily_limit',
      'limitScope', 'day',
      'currentLimit', p_daily_limit,
      'error', 'Daily usage limit reached.'
    );
  END IF;

  IF p_effective_tier = 'wrong_owner' THEN
    reservation_owner := '00000000-0000-4000-8000-000000000002';
  END IF;

  INSERT INTO public.generation_reservations (user_id)
  VALUES (reservation_owner)
  RETURNING id INTO reservation_id;

  IF p_effective_tier = 'post_bind_failure' THEN
    UPDATE public.mobile_generation_idempotency AS target
    SET request_hash = repeat('0', 64)
    WHERE target.id = (
      SELECT source.id
      FROM public.mobile_generation_idempotency AS source
      WHERE source.user_id = p_user_id
        AND source.client = 'mobile_web'
        AND source.status = 'in_progress'
        AND source.reservation_id IS NULL
      ORDER BY source.created_at DESC, source.id DESC
      LIMIT 1
    );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'post-bind failure hook could not find active row';
    END IF;
  END IF;

  IF p_effective_tier = 'missing_reservation_id' THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remainingRequests', jsonb_build_object(
        'minute', GREATEST(p_burst_limit - 1, 0),
        'day', p_daily_limit,
        'month', GREATEST(p_monthly_limit - 1, 0)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reservationId', reservation_id,
    'remainingRequests', jsonb_build_object(
      'minute', GREATEST(p_burst_limit - 1, 0),
      'day', p_daily_limit,
      'month', GREATEST(p_monthly_limit - 1, 0)
    )
  );
END;
$$;

\ir /tmp/2026-09-23_mobile_web_generation_idempotency.sql

INSERT INTO profiles (id)
VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

DO $$
DECLARE
  atomic_claim jsonb;
  atomic_record uuid;
  atomic_attempt uuid;
  atomic_outcome jsonb;
  atomic_reservation uuid;
  reservation_count_before integer;
  reservation_count_after integer;
  stale_claim jsonb;
  stale_attempt uuid;
  denial_claim jsonb;
  denial_record uuid;
  denial_attempt uuid;
  wrong_owner_claim jsonb;
  wrong_owner_record uuid;
  wrong_owner_attempt uuid;
  missing_id_claim jsonb;
  missing_id_record uuid;
  missing_id_attempt uuid;
  post_bind_claim jsonb;
  post_bind_record uuid;
  post_bind_attempt uuid;
  first_claim jsonb;
  first_record uuid;
  first_attempt uuid;
  first_reservation uuid;
  replay jsonb;
  reset_claim jsonb;
  reset_attempt uuid;
  stale_attempt_record uuid;
  stale_record uuid := gen_random_uuid();
  stale_reservation uuid := gen_random_uuid();
BEGIN
  atomic_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000104',
    repeat('d', 64)
  );
  SELECT id, attempt_id
  INTO atomic_record, atomic_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000104';

  SELECT COUNT(*)
  INTO reservation_count_before
  FROM public.generation_reservations
  WHERE user_id = '00000000-0000-4000-8000-000000000001';

  atomic_outcome := public.reserve_and_bind_mobile_generation_reservation(
    '00000000-0000-4000-8000-000000000001',
    atomic_record,
    atomic_attempt,
    'mobile_web',
    '00000000-0000-4000-8000-000000000104',
    repeat('d', 64),
    'current',
    'starter',
    75,
    10,
    10,
    5,
    false
  );
  IF atomic_outcome->>'allowed' <> 'true'
    OR atomic_outcome->>'reservationId' IS NULL
  THEN
    RAISE EXCEPTION 'atomic reservation did not succeed: %', atomic_outcome;
  END IF;
  atomic_reservation := (atomic_outcome->>'reservationId')::uuid;

  SELECT COUNT(*)
  INTO reservation_count_after
  FROM public.generation_reservations
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
  IF reservation_count_after <> reservation_count_before + 1 THEN
    RAISE EXCEPTION 'atomic success created an unexpected reservation count: %',
      reservation_count_after;
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.mobile_generation_idempotency
    WHERE id = atomic_record AND reservation_id = atomic_reservation
  ) <> 1 THEN
    RAISE EXCEPTION 'atomic success did not bind exactly one reservation';
  END IF;

  stale_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000105',
    repeat('e', 64)
  );
  SELECT id, attempt_id
  INTO stale_attempt_record, stale_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000105';
  SELECT COUNT(*)
  INTO reservation_count_before
  FROM public.generation_reservations
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
  stale_claim := public.reserve_and_bind_mobile_generation_reservation(
    '00000000-0000-4000-8000-000000000001',
    stale_attempt_record,
    gen_random_uuid(),
    'mobile_web',
    '00000000-0000-4000-8000-000000000105',
    repeat('e', 64),
    'current',
    'starter',
    75,
    10,
    10,
    5,
    false
  );
  IF stale_claim->>'allowed' <> 'false'
    OR stale_claim->>'code' <> 'idempotency_bind_failed'
  THEN
    RAISE EXCEPTION 'stale attempt was not rejected: %', stale_claim;
  END IF;
  SELECT COUNT(*)
  INTO reservation_count_after
  FROM public.generation_reservations
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
  IF reservation_count_after <> reservation_count_before THEN
    RAISE EXCEPTION 'stale attempt left a reservation behind';
  END IF;

  denial_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000106',
    repeat('f', 64)
  );
  SELECT id, attempt_id
  INTO denial_record, denial_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000106';
  SELECT COUNT(*)
  INTO reservation_count_before
  FROM public.generation_reservations
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
  denial_claim := public.reserve_and_bind_mobile_generation_reservation(
    '00000000-0000-4000-8000-000000000001',
    denial_record,
    denial_attempt,
    'mobile_web',
    '00000000-0000-4000-8000-000000000106',
    repeat('f', 64),
    'current',
    'deny',
    75,
    10,
    10,
    5,
    false
  );
  IF denial_claim->>'allowed' <> 'false'
    OR denial_claim->>'code' <> 'daily_limit'
  THEN
    RAISE EXCEPTION 'quota denial was not returned: %', denial_claim;
  END IF;
  SELECT COUNT(*)
  INTO reservation_count_after
  FROM public.generation_reservations
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
  IF reservation_count_after <> reservation_count_before THEN
    RAISE EXCEPTION 'quota denial left a reservation behind';
  END IF;

  wrong_owner_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000107',
    repeat('7', 64)
  );
  IF wrong_owner_claim->>'kind' <> 'new' THEN
    RAISE EXCEPTION 'expected wrong-owner claim to be new: %', wrong_owner_claim;
  END IF;
  SELECT id, attempt_id
  INTO wrong_owner_record, wrong_owner_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000107';
  SELECT COUNT(*)
  INTO reservation_count_before
  FROM public.generation_reservations;
  BEGIN
    PERFORM public.reserve_and_bind_mobile_generation_reservation(
      '00000000-0000-4000-8000-000000000001',
      wrong_owner_record,
      wrong_owner_attempt,
      'mobile_web',
      '00000000-0000-4000-8000-000000000107',
      repeat('7', 64),
      'current',
      'wrong_owner',
      75,
      10,
      10,
      5,
      false
    );
    RAISE EXCEPTION 'wrong-owner bind unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'mobile_generation_attempt_stale' THEN
        RAISE;
      END IF;
  END;
  SELECT COUNT(*)
  INTO reservation_count_after
  FROM public.generation_reservations;
  IF reservation_count_after <> reservation_count_before THEN
    RAISE EXCEPTION 'wrong-owner bind failure left a reservation behind';
  END IF;

  missing_id_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000108',
    repeat('8', 64)
  );
  IF missing_id_claim->>'kind' <> 'new' THEN
    RAISE EXCEPTION 'expected missing-ID claim to be new: %', missing_id_claim;
  END IF;
  SELECT id, attempt_id
  INTO missing_id_record, missing_id_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000108';
  SELECT COUNT(*)
  INTO reservation_count_before
  FROM public.generation_reservations;
  BEGIN
    PERFORM public.reserve_and_bind_mobile_generation_reservation(
      '00000000-0000-4000-8000-000000000001',
      missing_id_record,
      missing_id_attempt,
      'mobile_web',
      '00000000-0000-4000-8000-000000000108',
      repeat('8', 64),
      'current',
      'missing_reservation_id',
      75,
      10,
      10,
      5,
      false
    );
    RAISE EXCEPTION 'missing reservation ID unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'mobile_generation_reservation_missing' THEN
        RAISE;
      END IF;
  END;
  SELECT COUNT(*)
  INTO reservation_count_after
  FROM public.generation_reservations;
  IF reservation_count_after <> reservation_count_before THEN
    RAISE EXCEPTION 'missing reservation ID left a reservation behind';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.mobile_generation_idempotency
    WHERE id = missing_id_record AND reservation_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'missing reservation ID left an idempotency binding behind';
  END IF;

  post_bind_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000002',
    'mobile_web',
    '00000000-0000-4000-8000-000000000109',
    repeat('9', 64)
  );
  IF post_bind_claim->>'kind' <> 'new' THEN
    RAISE EXCEPTION 'expected post-bind claim to be new: %', post_bind_claim;
  END IF;
  SELECT id, attempt_id
  INTO post_bind_record, post_bind_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000109';
  SELECT COUNT(*)
  INTO reservation_count_before
  FROM public.generation_reservations;
  BEGIN
    PERFORM public.reserve_and_bind_mobile_generation_reservation(
      '00000000-0000-4000-8000-000000000002',
      post_bind_record,
      post_bind_attempt,
      'mobile_web',
      '00000000-0000-4000-8000-000000000109',
      repeat('9', 64),
      'current',
      'post_bind_failure',
      75,
      10,
      10,
      5,
      false
    );
    RAISE EXCEPTION 'post-reservation bind unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'mobile_generation_attempt_stale' THEN
        RAISE;
      END IF;
  END;
  SELECT COUNT(*)
  INTO reservation_count_after
  FROM public.generation_reservations;
  IF reservation_count_after <> reservation_count_before THEN
    RAISE EXCEPTION 'post-reservation bind failure left a reservation behind';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.mobile_generation_idempotency
    WHERE id = post_bind_record AND reservation_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'post-reservation bind failure left an idempotency binding behind';
  END IF;

  first_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000101',
    repeat('a', 64)
  );
  IF first_claim->>'kind' <> 'new' THEN
    RAISE EXCEPTION 'expected first claim to be new: %', first_claim;
  END IF;

  SELECT id, attempt_id
  INTO first_record, first_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000101';

  INSERT INTO generation_reservations (id, user_id)
  VALUES (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001'
  );
  first_reservation := '00000000-0000-4000-8000-000000000201';

  IF NOT public.bind_mobile_generation_reservation(
    first_record,
    first_attempt,
    first_reservation
  ) THEN
    RAISE EXCEPTION 'reservation bind failed';
  END IF;
  IF public.bind_mobile_generation_reservation(
    first_record,
    gen_random_uuid(),
    first_reservation
  ) THEN
    RAISE EXCEPTION 'attempt guard did not reject a wrong attempt';
  END IF;

  IF NOT public.mark_mobile_generation_commit_pending(
    first_record,
    first_attempt,
    first_reservation,
    '{"title":"Saved","description":"Description"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'commit-pending transition failed';
  END IF;

  replay := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000101',
    repeat('a', 64)
  );
  IF replay->>'kind' <> 'commit_pending' THEN
    RAISE EXCEPTION 'expected commit-pending resume: %', replay;
  END IF;

  IF NOT public.commit_generation_reservation(first_reservation) THEN
    RAISE EXCEPTION 'reservation commit failed';
  END IF;
  replay := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000101',
    repeat('a', 64)
  );
  IF replay->>'kind' <> 'succeeded' OR replay->'response'->>'title' <> 'Saved' THEN
    RAISE EXCEPTION 'expected committed output replay: %', replay;
  END IF;

  IF public.complete_mobile_generation_idempotency(
    first_record,
    gen_random_uuid(),
    '{"title":"Wrong","description":"Attempt"}'::jsonb,
    200,
    first_reservation
  ) THEN
    RAISE EXCEPTION 'completion attempt guard did not reject wrong attempt';
  END IF;

  IF public.mobile_generation_json_is_safe('{"url":"https://secret.example"}'::jsonb) THEN
    RAISE EXCEPTION 'unsafe URL JSON was accepted';
  END IF;
  IF public.mobile_generation_json_is_safe('{"token":"secret"}'::jsonb) THEN
    RAISE EXCEPTION 'unsafe token JSON was accepted';
  END IF;

  INSERT INTO public.mobile_generation_idempotency (
    id,
    attempt_id,
    user_id,
    client,
    request_id,
    request_hash,
    expires_at
  )
  VALUES (
    stale_record,
    gen_random_uuid(),
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000102',
    repeat('b', 64),
    now() - interval '2 days'
  );
  INSERT INTO generation_reservations (id, user_id)
  VALUES (
    stale_reservation,
    '00000000-0000-4000-8000-000000000001'
  );
  UPDATE public.mobile_generation_idempotency
  SET reservation_id = stale_reservation
  WHERE id = stale_record;

  IF public.cleanup_expired_mobile_generation_idempotency() <> 1 THEN
    RAISE EXCEPTION 'stale row cleanup count was not one';
  END IF;
  IF EXISTS (SELECT 1 FROM generation_reservations WHERE id = stale_reservation AND status <> 'refunded') THEN
    RAISE EXCEPTION 'stale pending reservation was not refunded';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mobile_generation_idempotency WHERE id = stale_record) THEN
    RAISE EXCEPTION 'stale row was not deleted';
  END IF;

  reset_claim := public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000103',
    repeat('c', 64)
  );
  SELECT attempt_id INTO reset_attempt
  FROM public.mobile_generation_idempotency
  WHERE request_id = '00000000-0000-4000-8000-000000000103';
  UPDATE public.mobile_generation_idempotency
  SET expires_at = now() - interval '2 hours'
  WHERE request_id = '00000000-0000-4000-8000-000000000103';
  IF public.claim_mobile_generation_idempotency(
    '00000000-0000-4000-8000-000000000001',
    'mobile_web',
    '00000000-0000-4000-8000-000000000103',
    repeat('c', 64)
  )->>'kind' <> 'new' THEN
    RAISE EXCEPTION 'unbound expired row did not reset';
  END IF;
  IF reset_attempt = (SELECT attempt_id FROM public.mobile_generation_idempotency WHERE request_id = '00000000-0000-4000-8000-000000000103') THEN
    RAISE EXCEPTION 'expired row reused its old attempt id';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mobile_generation_idempotency'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled';
  END IF;
  IF has_table_privilege('anon', 'public.mobile_generation_idempotency', 'SELECT') THEN
    RAISE EXCEPTION 'anon unexpectedly has table access';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_mobile_generation_idempotency(uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has claim RPC access';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.reserve_and_bind_mobile_generation_reservation(uuid,uuid,uuid,text,uuid,text,text,text,integer,integer,integer,integer,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated unexpectedly has atomic reservation RPC access';
  END IF;
END;
$$;

SELECT 'mobile idempotency PostgreSQL harness passed' AS result;
