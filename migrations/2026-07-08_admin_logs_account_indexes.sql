-- Speeds up admin account-scoped log lookups from /admin/users -> Logs.
-- The UI uses user_id when available and falls back to email only for older rows.

CREATE INDEX IF NOT EXISTS idx_api_logs_user_id_created_at_desc
  ON api_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_logs_user_email_created_at_desc
  ON api_logs (user_email, created_at DESC)
  WHERE user_email IS NOT NULL;
