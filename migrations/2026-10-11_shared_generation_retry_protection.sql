BEGIN;

-- Reuse the existing short-lived records and cleanup for both clients.
-- Historical table/RPC names are retained for deployed mobile compatibility.
ALTER TABLE public.mobile_generation_idempotency
  DROP CONSTRAINT mobile_generation_idempotency_client_check;
ALTER TABLE public.mobile_generation_idempotency
  ADD CONSTRAINT mobile_generation_idempotency_client_check
  CHECK (client IN ('mobile_web', 'extension'));

CREATE OR REPLACE FUNCTION public.reserve_and_bind_mobile_generation_reservation(
  p_user_id uuid,
  p_record_id uuid,
  p_attempt_id uuid,
  p_client text,
  p_request_id uuid,
  p_request_hash text,
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
  idempotency_row public.mobile_generation_idempotency%ROWTYPE;
  reservation_outcome jsonb;
  bound_reservation_id uuid;
BEGIN
  IF (p_client IS NULL OR p_client NOT IN ('mobile_web', 'extension'))
    OR p_request_id IS NULL
    OR p_request_hash IS NULL
    OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'idempotency_bind_failed',
      'error', 'This generation request is no longer active.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = p_user_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'service_unavailable',
      'limitScope', 'service',
      'error', 'Could not retrieve profile.'
    );
  END IF;

  SELECT *
  INTO idempotency_row
  FROM public.mobile_generation_idempotency AS i
  WHERE i.id = p_record_id
    AND i.attempt_id = p_attempt_id
    AND i.user_id = p_user_id
    AND i.client = p_client
    AND i.request_id = p_request_id
    AND i.request_hash = p_request_hash
    AND i.status = 'in_progress'
    AND NOT i.commit_pending
    AND i.reservation_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'idempotency_bind_failed',
      'error', 'This generation request is no longer active.'
    );
  END IF;

  reservation_outcome := public.reserve_generation_request_for_current_status(
    p_user_id,
    p_pricing_limits_mode,
    p_effective_tier,
    p_monthly_limit,
    p_daily_limit,
    p_burst_limit,
    p_free_lifetime_limit,
    p_has_unlimited_daily
  );

  IF COALESCE((reservation_outcome->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN reservation_outcome;
  END IF;

  bound_reservation_id := NULLIF(
    COALESCE(
      reservation_outcome->>'reservationId',
      reservation_outcome->>'reservation_id'
    ),
    ''
  )::uuid;

  IF bound_reservation_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'mobile_generation_reservation_missing';
  END IF;

  UPDATE public.mobile_generation_idempotency AS i
  SET
    reservation_id = bound_reservation_id,
    updated_at = timezone('utc', now())
  WHERE i.id = p_record_id
    AND i.attempt_id = p_attempt_id
    AND i.user_id = p_user_id
    AND i.client = p_client
    AND i.request_id = p_request_id
    AND i.request_hash = p_request_hash
    AND i.status = 'in_progress'
    AND NOT i.commit_pending
    AND i.reservation_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.generation_reservations AS r
      WHERE r.id = bound_reservation_id
        AND r.user_id = i.user_id
        AND r.status = 'pending'
    );

  IF NOT FOUND THEN
    -- Raising here aborts the RPC transaction, including the new reservation.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'mobile_generation_attempt_stale';
  END IF;

  RETURN reservation_outcome;
END;
$$;

COMMIT;
