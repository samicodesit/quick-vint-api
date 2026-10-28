BEGIN;
CREATE TABLE billing_notices (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  stripe_subscription_id text,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','manual_review','superseded')),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz,
  locked_until timestamptz,
  lease uuid,
  attempts integer NOT NULL DEFAULT 0,
  resend_email_id text,
  sent_at timestamptz,
  last_error text
);
ALTER TABLE billing_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_notices FROM anon, authenticated;
GRANT ALL ON billing_notices TO service_role;
CREATE INDEX billing_notices_pending ON billing_notices(status,next_attempt_at);
CREATE INDEX billing_notices_subscription ON billing_notices(stripe_subscription_id,created_at);

CREATE FUNCTION claim_billing_notice(p_key text) RETURNS SETOF billing_notices
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Resend idempotency expires after 24h. Ambiguous old attempts need reconciliation,
  -- not an automatic duplicate customer email.
  UPDATE billing_notices SET status='manual_review',last_error='Reconcile provider before retry: idempotency window expired'
  WHERE key=p_key AND status IN ('sending','failed') AND first_attempt_at < now()-interval '23 hours'
    AND (locked_until IS NULL OR locked_until < now());
  RETURN QUERY UPDATE billing_notices SET status='sending',lease=gen_random_uuid(),
    first_attempt_at=coalesce(first_attempt_at,now()),locked_until=now()+interval '5 minutes',attempts=attempts+1
  WHERE key=p_key AND status IN ('pending','failed','sending')
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    AND (locked_until IS NULL OR locked_until < now())
  RETURNING *;
END $$;
REVOKE ALL ON FUNCTION claim_billing_notice(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_billing_notice(text) TO service_role;
COMMIT;
