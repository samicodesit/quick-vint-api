-- Run each statement with autocommit, outside a transaction. Concurrent builds
-- preserve ordinary api_logs writes. Stop on errors; verify all four indexes are
-- valid before applying the separate transactional policy migration.
SET lock_timeout='2s';
SET statement_timeout='60s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS api_logs_auth_client_time ON api_logs
  (user_id,endpoint,(full_request_body->'context'->>'analyticsClientId'),created_at DESC)
  WHERE endpoint IN ('/event/token_refresh_failed','/event/auth_session_result','/event/auth_action_result');
CREATE INDEX CONCURRENTLY IF NOT EXISTS api_logs_auth_operation ON api_logs
  (user_id,(full_request_body->'context'->>'operationId'),created_at DESC)
  WHERE endpoint IN ('/event/token_refresh_failed','/event/auth_session_result');
CREATE INDEX CONCURRENTLY IF NOT EXISTS api_logs_auth_refresh_reference ON api_logs
  (user_id,(full_request_body->'context'->>'authRefreshOperationId'),created_at DESC)
  WHERE endpoint='/event/auth_action_result';
CREATE INDEX CONCURRENTLY IF NOT EXISTS incident_receipts_owner_attempt ON incident_receipts
  (owner_key,attempt_id,incident_id);
RESET lock_timeout;
RESET statement_timeout;
