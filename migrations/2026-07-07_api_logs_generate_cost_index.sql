-- Speeds up admin AI cost reporting for the rolling OpenAI cost window.
-- The query only reads generation logs after a recent date, newest first.

CREATE INDEX IF NOT EXISTS idx_api_logs_generate_created_at_desc
  ON api_logs (created_at DESC)
  WHERE endpoint = '/api/generate';
