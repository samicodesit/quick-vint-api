-- Track users who already received the one-time honest review request.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;

COMMENT ON COLUMN profiles.review_request_sent_at IS
  'Timestamp when the one-time honest Chrome Web Store review request email was sent.';
