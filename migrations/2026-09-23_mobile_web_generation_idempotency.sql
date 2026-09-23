BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.mobile_generation_json_is_safe(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  child jsonb;
  key_text text;
  text_value text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) IN ('null', 'boolean', 'number') THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(p_value) = 'string' THEN
    text_value := p_value #>> '{}';
    RETURN NOT (
      text_value ~* 'https?://'
      OR text_value ~* '(^|[[:space:]])//[[:alnum:]][^[:space:]]*'
      OR text_value ~* 'data:[^[:space:]]+'
      OR text_value ~* 'base64[[:space:]]*[,=:]'
      OR text_value ~* '(^|[?&[:space:]])(token|signature|sig|access_token|authorization|expires|x-amz-[a-z-]+)[[:space:]]*='
      OR text_value ~* '(^|[[:space:]])bearer[[:space:]]+[A-Za-z0-9._~+/=-]{16,}([[:space:]]|$)'
      OR text_value ~* '(^|[[:space:]])[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}([[:space:]]|$)'
      OR text_value ~* '(^|[[:space:]])[A-Za-z0-9+/]{128,}={0,2}([[:space:]]|$)'
      OR text_value ~* '(^|[[:space:]])(sk|pk|rk|tok|token|secret|key)[-_: =][A-Za-z0-9._~-]{16,}([[:space:]]|$)'
    );
  END IF;

  IF jsonb_typeof(p_value) = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF NOT public.mobile_generation_json_is_safe(child) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  IF jsonb_typeof(p_value) = 'object' THEN
    FOR key_text, child IN SELECT key, value FROM jsonb_each(p_value) LOOP
      IF key_text ~* '(url|token|secret|signature|authorization)'
        OR NOT public.mobile_generation_json_is_safe(to_jsonb(key_text))
        OR NOT public.mobile_generation_json_is_safe(child)
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS public.mobile_generation_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client text NOT NULL CHECK (client = 'mobile_web'),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  retryable boolean NOT NULL DEFAULT false,
  commit_pending boolean NOT NULL DEFAULT false,
  reservation_id uuid REFERENCES public.generation_reservations(id) ON DELETE SET NULL,
  response_json jsonb,
  response_status integer
    CHECK (response_status IS NULL OR response_status IN (200, 400, 403, 429, 500, 503, 504)),
  failure_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT mobile_generation_idempotency_response_size CHECK (
    response_json IS NULL
    OR octet_length(convert_to(response_json::text, 'UTF8')) <= 32768
  ),
  CONSTRAINT mobile_generation_idempotency_safe_response CHECK (
    response_json IS NULL
    OR public.mobile_generation_json_is_safe(response_json)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_generation_idempotency_owner_request
  ON public.mobile_generation_idempotency (user_id, client, request_id);

CREATE INDEX IF NOT EXISTS idx_mobile_generation_idempotency_request_hash
  ON public.mobile_generation_idempotency (request_hash);

CREATE INDEX IF NOT EXISTS idx_mobile_generation_idempotency_expires_at
  ON public.mobile_generation_idempotency (expires_at);

ALTER TABLE public.mobile_generation_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mobile_generation_idempotency FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mobile_generation_json_is_safe(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_mobile_generation_idempotency(
  p_user_id uuid,
  p_client text,
  p_request_id uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
  inserted_attempt_id uuid;
  reset_attempt_id uuid;
  reservation_status text;
  reservation_found boolean := false;
  existing_row public.mobile_generation_idempotency%ROWTYPE;
  now_utc timestamptz := timezone('utc', now());
BEGIN
  INSERT INTO public.mobile_generation_idempotency (
    user_id,
    client,
    request_id,
    request_hash,
    status,
    retryable,
    commit_pending,
    expires_at
  )
  VALUES (
    p_user_id,
    p_client,
    p_request_id,
    p_request_hash,
    'in_progress',
    false,
    false,
    now_utc + interval '15 minutes'
  )
  ON CONFLICT (user_id, client, request_id) DO NOTHING
  RETURNING id, attempt_id INTO inserted_id, inserted_attempt_id;

  IF inserted_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'kind', 'new',
      'recordId', inserted_id,
      'attemptId', inserted_attempt_id
    );
  END IF;

  SELECT *
  INTO existing_row
  FROM public.mobile_generation_idempotency
  WHERE user_id = p_user_id
    AND client = p_client
    AND request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR existing_row.request_hash <> p_request_hash THEN
    RETURN jsonb_build_object('kind', 'conflict');
  END IF;

  IF existing_row.status = 'succeeded' THEN
    RETURN jsonb_build_object(
      'kind', 'succeeded',
      'response', COALESCE(existing_row.response_json, '{}'::jsonb),
      'statusCode', COALESCE(existing_row.response_status, 200)
    );
  END IF;

  IF existing_row.reservation_id IS NOT NULL THEN
    SELECT true, status::text
    INTO reservation_found, reservation_status
    FROM public.generation_reservations
    WHERE id = existing_row.reservation_id;
    IF NOT FOUND THEN
      reservation_found := false;
      reservation_status := NULL;
    END IF;
  END IF;

  IF existing_row.commit_pending
    AND reservation_status = 'pending'
    AND existing_row.expires_at <= now_utc
  THEN
    PERFORM public.refund_generation_reservation(
      existing_row.reservation_id,
      'idempotency_expired'
    );
    SELECT status::text
    INTO reservation_status
    FROM public.generation_reservations
    WHERE id = existing_row.reservation_id;
  END IF;

  IF existing_row.commit_pending THEN
    IF reservation_status = 'committed'
      AND existing_row.response_json IS NOT NULL
      AND public.mobile_generation_json_is_safe(existing_row.response_json)
    THEN
      UPDATE public.mobile_generation_idempotency
      SET
        status = 'succeeded',
        retryable = false,
        commit_pending = false,
        response_status = 200,
        expires_at = now_utc + interval '15 minutes',
        updated_at = now_utc
      WHERE id = existing_row.id
        AND attempt_id = existing_row.attempt_id;

      RETURN jsonb_build_object(
        'kind', 'succeeded',
        'response', existing_row.response_json,
        'statusCode', 200
      );
    END IF;

    IF reservation_status = 'refunded' OR NOT reservation_found THEN
      IF existing_row.expires_at <= now_utc THEN
        UPDATE public.mobile_generation_idempotency
        SET
          status = 'in_progress',
          retryable = false,
          commit_pending = false,
          attempt_id = gen_random_uuid(),
          reservation_id = NULL,
          response_json = NULL,
          response_status = NULL,
          failure_code = NULL,
          expires_at = now_utc + interval '15 minutes',
          updated_at = now_utc
        WHERE id = existing_row.id
        RETURNING attempt_id INTO reset_attempt_id;

        RETURN jsonb_build_object(
          'kind', 'new',
          'recordId', existing_row.id,
          'attemptId', reset_attempt_id
        );
      END IF;
    END IF;

    IF reservation_status = 'pending'
      AND existing_row.response_json IS NOT NULL
      AND public.mobile_generation_json_is_safe(existing_row.response_json)
    THEN
      RETURN jsonb_build_object(
        'kind', 'commit_pending',
        'recordId', existing_row.id,
        'attemptId', existing_row.attempt_id,
        'reservationId', existing_row.reservation_id,
        'response', existing_row.response_json
      );
    END IF;
  END IF;

  IF existing_row.expires_at <= now_utc THEN
    IF reservation_status = 'pending' THEN
      PERFORM public.refund_generation_reservation(
        existing_row.reservation_id,
        'idempotency_expired'
      );
      SELECT status::text
      INTO reservation_status
      FROM public.generation_reservations
      WHERE id = existing_row.reservation_id;
    END IF;

    IF reservation_status IS NULL OR reservation_status = 'refunded' THEN
      UPDATE public.mobile_generation_idempotency
      SET
        status = 'in_progress',
        retryable = false,
        commit_pending = false,
        attempt_id = gen_random_uuid(),
        reservation_id = NULL,
        response_json = NULL,
        response_status = NULL,
        failure_code = NULL,
        expires_at = now_utc + interval '15 minutes',
        updated_at = now_utc
      WHERE id = existing_row.id
      RETURNING attempt_id INTO reset_attempt_id;

      RETURN jsonb_build_object(
        'kind', 'new',
        'recordId', existing_row.id,
        'attemptId', reset_attempt_id
      );
    END IF;

    IF reservation_status = 'committed' THEN
      IF existing_row.response_json IS NOT NULL
        AND public.mobile_generation_json_is_safe(existing_row.response_json)
      THEN
        UPDATE public.mobile_generation_idempotency
        SET
          status = 'succeeded',
          retryable = false,
          commit_pending = false,
          response_status = 200,
          expires_at = now_utc + interval '15 minutes',
          updated_at = now_utc
        WHERE id = existing_row.id
          AND attempt_id = existing_row.attempt_id;

        RETURN jsonb_build_object(
          'kind', 'succeeded',
          'response', existing_row.response_json,
          'statusCode', 200
        );
      ELSE
        UPDATE public.mobile_generation_idempotency
        SET
          status = 'failed',
          retryable = false,
          commit_pending = false,
          response_json = jsonb_build_object(
            'error', 'Generation completed but its response could not be recovered.',
            'code', 'generation_response_unavailable'
          ),
          response_status = 500,
          failure_code = 'generation_response_unavailable',
          expires_at = now_utc + interval '15 minutes',
          updated_at = now_utc
        WHERE id = existing_row.id
          AND attempt_id = existing_row.attempt_id;

        RETURN jsonb_build_object(
          'kind', 'failed',
          'statusCode', 500,
          'body', jsonb_build_object(
            'error', 'Generation completed but its response could not be recovered.',
            'code', 'generation_response_unavailable'
          ),
          'retryable', false
        );
      END IF;
    END IF;
  END IF;

  IF existing_row.status = 'failed' THEN
    RETURN jsonb_build_object(
      'kind', 'failed',
      'statusCode', COALESCE(existing_row.response_status, 500),
      'body', COALESCE(existing_row.response_json, jsonb_build_object(
        'error', 'Generation failed. Please try again.'
      )),
      'retryable', existing_row.retryable
    );
  END IF;

  RETURN jsonb_build_object(
    'kind', 'in_progress',
    'requestId', existing_row.request_id,
    'attemptId', existing_row.attempt_id,
    'commitPending', existing_row.commit_pending
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_mobile_generation_reservation(
  p_record_id uuid,
  p_attempt_id uuid,
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.mobile_generation_idempotency AS i
  SET
    reservation_id = p_reservation_id,
    updated_at = timezone('utc', now())
  WHERE i.id = p_record_id
    AND i.attempt_id = p_attempt_id
    AND i.status = 'in_progress'
    AND NOT i.commit_pending
    AND (i.reservation_id IS NULL OR i.reservation_id = p_reservation_id)
    AND EXISTS (
      SELECT 1
      FROM public.generation_reservations AS r
      WHERE r.id = p_reservation_id
        AND r.user_id = i.user_id
        AND r.status = 'pending'
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mobile_generation_idempotency(
  p_record_id uuid,
  p_attempt_id uuid,
  p_response_json jsonb,
  p_response_status integer DEFAULT 200,
  p_reservation_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.mobile_generation_json_is_safe(p_response_json) THEN
    RETURN false;
  END IF;

  UPDATE public.mobile_generation_idempotency
  SET
    status = 'succeeded',
    retryable = false,
    commit_pending = false,
    reservation_id = COALESCE(p_reservation_id, reservation_id),
    response_json = p_response_json,
    response_status = p_response_status,
    failure_code = NULL,
    expires_at = COALESCE(p_expires_at, timezone('utc', now()) + interval '15 minutes'),
    updated_at = timezone('utc', now())
  WHERE id = p_record_id
    AND attempt_id = p_attempt_id
    AND status = 'in_progress'
    AND p_reservation_id IS NOT NULL
    AND (reservation_id IS NULL OR reservation_id = p_reservation_id)
    AND EXISTS (
      SELECT 1
      FROM public.generation_reservations AS r
      WHERE r.id = p_reservation_id
        AND r.user_id = (
          SELECT i.user_id
          FROM public.mobile_generation_idempotency AS i
          WHERE i.id = p_record_id
            AND i.attempt_id = p_attempt_id
        )
        AND r.status = 'committed'
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_mobile_generation_idempotency(
  p_record_id uuid,
  p_attempt_id uuid,
  p_status_code integer,
  p_body jsonb,
  p_failure_code text DEFAULT NULL,
  p_retryable boolean DEFAULT false,
  p_reservation_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.mobile_generation_json_is_safe(p_body) THEN
    RETURN false;
  END IF;

  UPDATE public.mobile_generation_idempotency
  SET
    status = 'failed',
    retryable = COALESCE(p_retryable, false),
    commit_pending = false,
    reservation_id = COALESCE(p_reservation_id, reservation_id),
    response_json = p_body,
    response_status = p_status_code,
    failure_code = p_failure_code,
    expires_at = COALESCE(
      p_expires_at,
      timezone('utc', now()) + CASE
        WHEN COALESCE(p_retryable, false) THEN interval '2 minutes'
        ELSE interval '15 minutes'
      END
    ),
    updated_at = timezone('utc', now())
  WHERE id = p_record_id
    AND attempt_id = p_attempt_id
    AND status = 'in_progress'
    AND NOT commit_pending
    AND (p_reservation_id IS NULL OR reservation_id IS NULL OR reservation_id = p_reservation_id)
    AND (
      p_reservation_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.generation_reservations AS r
        WHERE r.id = p_reservation_id
          AND r.user_id = (
            SELECT i.user_id
            FROM public.mobile_generation_idempotency AS i
            WHERE i.id = p_record_id
              AND i.attempt_id = p_attempt_id
          )
      )
    );

  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.mark_mobile_generation_commit_pending(uuid, uuid, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.mark_mobile_generation_commit_pending(
  p_record_id uuid,
  p_attempt_id uuid,
  p_reservation_id uuid,
  p_response_json jsonb,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_reservation_id IS NULL
    OR p_response_json IS NULL
    OR NOT public.mobile_generation_json_is_safe(p_response_json)
    OR octet_length(convert_to(p_response_json::text, 'UTF8')) > 32768
  THEN
    RETURN false;
  END IF;

  UPDATE public.mobile_generation_idempotency
  SET
    status = 'in_progress',
    commit_pending = true,
    reservation_id = p_reservation_id,
    response_json = p_response_json,
    response_status = 200,
    retryable = false,
    expires_at = COALESCE(p_expires_at, timezone('utc', now()) + interval '2 minutes'),
    updated_at = timezone('utc', now())
  WHERE id = p_record_id
    AND attempt_id = p_attempt_id
    AND status = 'in_progress'
    AND (reservation_id IS NULL OR reservation_id = p_reservation_id)
    AND EXISTS (
      SELECT 1
      FROM public.generation_reservations AS r
      WHERE r.id = p_reservation_id
        AND r.user_id = (
          SELECT i.user_id
          FROM public.mobile_generation_idempotency AS i
          WHERE i.id = p_record_id
        )
        AND r.status = 'pending'
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_generation_reservation_status(
  p_reservation_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status::text
  FROM public.generation_reservations
  WHERE id = p_reservation_id;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_mobile_generation_idempotency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  stale_row record;
  reservation_status text;
BEGIN
  FOR stale_row IN
    SELECT id, reservation_id, status, commit_pending, response_json
    FROM public.mobile_generation_idempotency
    WHERE expires_at < now() - interval '1 day'
    FOR UPDATE SKIP LOCKED
  LOOP
    reservation_status := NULL;
    IF stale_row.reservation_id IS NOT NULL THEN
      SELECT status::text
      INTO reservation_status
      FROM public.generation_reservations
      WHERE id = stale_row.reservation_id
      FOR UPDATE;

      IF reservation_status = 'pending' THEN
        PERFORM public.refund_generation_reservation(
          stale_row.reservation_id,
          'idempotency_expired'
        );
        SELECT status::text
        INTO reservation_status
        FROM public.generation_reservations
        WHERE id = stale_row.reservation_id;
      END IF;

      IF reservation_status = 'committed'
        AND stale_row.status = 'in_progress'
      THEN
        IF stale_row.response_json IS NOT NULL
          AND public.mobile_generation_json_is_safe(stale_row.response_json)
        THEN
          UPDATE public.mobile_generation_idempotency
          SET
            status = 'succeeded',
            retryable = false,
            commit_pending = false,
            response_status = 200,
            expires_at = timezone('utc', now()) + interval '15 minutes',
            updated_at = timezone('utc', now())
          WHERE id = stale_row.id;
        ELSE
          UPDATE public.mobile_generation_idempotency
          SET
            status = 'failed',
            retryable = false,
            commit_pending = false,
            response_json = jsonb_build_object(
              'error', 'Generation completed but its response could not be recovered.',
              'code', 'generation_response_unavailable'
            ),
            response_status = 500,
            failure_code = 'generation_response_unavailable',
            expires_at = timezone('utc', now()) + interval '15 minutes',
            updated_at = timezone('utc', now())
          WHERE id = stale_row.id;
        END IF;
        CONTINUE;
      END IF;
    END IF;

    IF stale_row.status IN ('succeeded', 'failed') THEN
      DELETE FROM public.mobile_generation_idempotency
      WHERE id = stale_row.id;
      deleted_count := deleted_count + 1;
      CONTINUE;
    END IF;

    IF stale_row.reservation_id IS NOT NULL
      AND reservation_status IS DISTINCT FROM 'refunded'
      AND reservation_status IS NOT NULL
    THEN
      CONTINUE;
    END IF;

    DELETE FROM public.mobile_generation_idempotency
    WHERE id = stale_row.id;
    deleted_count := deleted_count + 1;
  END LOOP;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mobile_generation_idempotency(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_mobile_generation_reservation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_mobile_generation_idempotency(uuid, uuid, jsonb, integer, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_mobile_generation_idempotency(uuid, uuid, integer, jsonb, text, boolean, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_mobile_generation_commit_pending(uuid, uuid, uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_generation_reservation_status(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_mobile_generation_idempotency()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_mobile_generation_idempotency(uuid, text, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_mobile_generation_reservation(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mobile_generation_json_is_safe(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mobile_generation_idempotency(uuid, uuid, jsonb, integer, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_mobile_generation_idempotency(uuid, uuid, integer, jsonb, text, boolean, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_mobile_generation_commit_pending(uuid, uuid, uuid, jsonb, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_generation_reservation_status(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_mobile_generation_idempotency()
  TO service_role;

COMMIT;
