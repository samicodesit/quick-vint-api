BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mobile_generation_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'new', 'recordId', inserted_id);
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

  IF existing_row.expires_at <= now_utc THEN
    UPDATE public.mobile_generation_idempotency
    SET
      status = 'in_progress',
      retryable = false,
      commit_pending = false,
      reservation_id = NULL,
      response_json = NULL,
      response_status = NULL,
      failure_code = NULL,
      expires_at = now_utc + interval '15 minutes',
      updated_at = now_utc
    WHERE id = existing_row.id;

    RETURN jsonb_build_object('kind', 'new', 'recordId', existing_row.id);
  END IF;

  IF existing_row.status = 'succeeded' THEN
    RETURN jsonb_build_object(
      'kind', 'succeeded',
      'response', COALESCE(existing_row.response_json, '{}'::jsonb),
      'statusCode', COALESCE(existing_row.response_status, 200)
    );
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
    'requestId', existing_row.request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mobile_generation_idempotency(
  p_record_id uuid,
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
    AND status = 'in_progress'
    AND NOT commit_pending;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_mobile_generation_idempotency(
  p_record_id uuid,
  p_status_code integer,
  p_body jsonb,
  p_failure_code text DEFAULT NULL,
  p_retryable boolean DEFAULT false,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mobile_generation_idempotency
  SET
    status = 'failed',
    retryable = COALESCE(p_retryable, false),
    commit_pending = false,
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
    AND status = 'in_progress'
    AND NOT commit_pending;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_mobile_generation_commit_pending(
  p_record_id uuid,
  p_reservation_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mobile_generation_idempotency
  SET
    status = 'in_progress',
    commit_pending = true,
    reservation_id = COALESCE(p_reservation_id, reservation_id),
    expires_at = COALESCE(p_expires_at, timezone('utc', now()) + interval '2 minutes'),
    updated_at = timezone('utc', now())
  WHERE id = p_record_id
    AND status = 'in_progress';

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
  deleted_count integer;
BEGIN
  DELETE FROM public.mobile_generation_idempotency
  WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mobile_generation_idempotency(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_mobile_generation_idempotency(uuid, jsonb, integer, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_mobile_generation_idempotency(uuid, integer, jsonb, text, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_mobile_generation_commit_pending(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_generation_reservation_status(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_mobile_generation_idempotency()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_mobile_generation_idempotency(uuid, text, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mobile_generation_idempotency(uuid, jsonb, integer, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_mobile_generation_idempotency(uuid, integer, jsonb, text, boolean, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_mobile_generation_commit_pending(uuid, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_generation_reservation_status(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_mobile_generation_idempotency()
  TO service_role;

COMMIT;
