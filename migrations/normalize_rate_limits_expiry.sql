-- migrations/normalize_rate_limits_expiry.sql
-- Dry-run: Preview rows with NULL expires_at
SELECT 'rows_with_null_expiry' AS metric, COUNT(*) FROM rate_limits WHERE expires_at IS NULL;

-- Transactional update: set sensible expiries based on window_type
BEGIN;

-- For minute windows: expire at start of next minute
UPDATE rate_limits
SET expires_at = date_trunc('minute', now()) + interval '1 minute'
WHERE expires_at IS NULL AND window_type = 'minute';

-- For day windows: expire at start of next day
UPDATE rate_limits
SET expires_at = (date_trunc('day', now()) + interval '1 day')
WHERE expires_at IS NULL AND window_type = 'day';

-- For month windows: expire at start of next month
UPDATE rate_limits
SET expires_at = (date_trunc('month', now()) + interval '1 month')
WHERE expires_at IS NULL AND window_type = 'month';

-- For any other windows or unknown types, set a short 24h expiry
UPDATE rate_limits
SET expires_at = now() + interval '24 hours'
WHERE expires_at IS NULL AND window_type NOT IN ('minute', 'day', 'month');

COMMIT;

-- Note: run the select above first to verify how many rows will change.
-- Always back up rate_limits before running this on production.
