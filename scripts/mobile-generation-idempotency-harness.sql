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

\ir /tmp/2026-09-23_mobile_web_generation_idempotency.sql

INSERT INTO profiles (id)
VALUES ('00000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  first_claim jsonb;
  first_record uuid;
  first_attempt uuid;
  first_reservation uuid;
  replay jsonb;
  reset_claim jsonb;
  reset_attempt uuid;
  stale_record uuid := gen_random_uuid();
  stale_reservation uuid := gen_random_uuid();
BEGIN
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
END;
$$;

SELECT 'mobile idempotency PostgreSQL harness passed' AS result;
