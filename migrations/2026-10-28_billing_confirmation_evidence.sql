BEGIN;

-- Private service-role ledger. Existing historical messages stay unknown.
ALTER TABLE subscription_welcome_emails
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS payload_sha256 text,
  ADD COLUMN IF NOT EXISTS content_version text,
  ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz;

ALTER TABLE subscription_welcome_emails DROP CONSTRAINT subscription_welcome_emails_status_check;
ALTER TABLE subscription_welcome_emails ADD CONSTRAINT subscription_welcome_emails_status_check
  CHECK(status IN ('pending','sending','sent','failed','manual_review'));

COMMENT ON COLUMN subscription_welcome_emails.payload IS
  'Exact Resend request archived before first send; sent means provider accepted, not delivered or read. Null for historical sends without preserved content.';

COMMIT;
