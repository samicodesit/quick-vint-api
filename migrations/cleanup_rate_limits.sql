-- cleanup_rate_limits.sql
-- Purpose: Canonicalize `rate_limits` so there's at most one active row per (user_id, window_type).
-- Keeps the row with the highest `count` for each (user_id, window_type) and removes hourly rows.
-- IMPORTANT: Run a dry-run SELECTs first and backup before applying. This script is written for PostgreSQL (Supabase).

-- Dry-run: counts and duplicates overview (run these first)
-- Count total rows
SELECT 'total_rows' AS metric, COUNT(*) FROM rate_limits;
-- Count hourly rows
SELECT 'hour_rows' AS metric, COUNT(*) FROM rate_limits WHERE window_type = 'hour';
-- Count active rows (not expired)
SELECT 'active_rows' AS metric, COUNT(*) FROM rate_limits WHERE expires_at > now();
-- See potential duplicates (user_id + window_type groups with more than 1 row)
SELECT user_id, window_type, COUNT(*) AS cnt
FROM rate_limits
GROUP BY user_id, window_type
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 100;

-- Preview canonical rows (sample)
-- This shows which rows would be kept (highest count per user/window)
SELECT DISTINCT ON (user_id, window_type) *
FROM rate_limits
WHERE window_type <> 'hour' AND expires_at > now()
ORDER BY user_id, window_type, count DESC, expires_at DESC
LIMIT 200;

-- If you are satisfied with the preview, run the transactional cleanup below.
-- The transactional block will:
-- 1) create a backup table `rate_limits_backup` (if not exists) and copy all rows into it
-- 2) create canonical rows in a temp table
-- 3) delete non-hour rows from `rate_limits`
-- 4) insert canonical rows back into `rate_limits`
-- 5) delete all hour rows (if you want to fully remove hour rows)

BEGIN;

-- 1) Backup (non-destructive)
CREATE TABLE IF NOT EXISTS rate_limits_backup AS TABLE rate_limits WITH NO DATA;
INSERT INTO rate_limits_backup SELECT * FROM rate_limits;

-- 2) Build canonical set (keep highest count per user_id+window_type)
CREATE TEMP TABLE rate_limits_canonical AS
SELECT DISTINCT ON (user_id, window_type) *
FROM rate_limits
WHERE window_type <> 'hour' AND expires_at > now()
ORDER BY user_id, window_type, count DESC, expires_at DESC;

-- 3) Remove current non-hour rows
DELETE FROM rate_limits WHERE window_type <> 'hour';

-- 4) Re-insert canonical rows
INSERT INTO rate_limits SELECT * FROM rate_limits_canonical;

-- 5) (Optional) Remove hour rows if you want to purge them entirely
DELETE FROM rate_limits WHERE window_type = 'hour';

-- Sanity counts after operation
SELECT 'after_total_rows' AS metric, COUNT(*) FROM rate_limits;
SELECT 'after_hour_rows' AS metric, COUNT(*) FROM rate_limits WHERE window_type = 'hour';

COMMIT;

-- Notes:
-- - This script assumes there are no strict foreign key constraints preventing deletes/inserts. If your schema enforces constraints, adapt accordingly.
-- - The backup table `rate_limits_backup` will contain a full copy of the pre-cleanup table so you can restore if needed.
-- - If you'd rather archive deleted rows into a separate table instead of deleting, change the DELETEs into INSERT ... SELECT into an archive table, then delete.
-- - Always run the dry-run SELECTs above first and inspect results before running the transactional block.











-- archive
CREATE TABLE IF NOT EXISTS rate_limits_hour_archive AS TABLE rate_limits WITH NO DATA;
INSERT INTO rate_limits_hour_archive SELECT * FROM rate_limits WHERE window_type = 'hour';

-- then delete (only if you are sure)
DELETE FROM rate_limits WHERE window_type = 'hour';