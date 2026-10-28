BEGIN;
CREATE TABLE billing_email_delivery_events (
  id text PRIMARY KEY,
  resend_email_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_email_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_email_delivery_events FROM anon,authenticated;
GRANT ALL ON billing_email_delivery_events TO service_role;
CREATE INDEX billing_email_delivery_message ON billing_email_delivery_events(resend_email_id,occurred_at);
COMMENT ON TABLE billing_email_delivery_events IS 'Verified Resend events. Delivered means receiving mail server accepted; it does not prove reading or agreement.';
COMMIT;
