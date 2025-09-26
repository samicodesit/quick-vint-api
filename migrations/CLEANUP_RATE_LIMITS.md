DB Cleanup: canonicalize `rate_limits`

What this migration does

- Creates a backup table `rate_limits_backup` (if not present) and copies all rows from `rate_limits` into it.
- Constructs a canonical set of active, non-hour `rate_limits` rows by keeping the row with the highest `count` for each (user_id, window_type).
- Deletes existing non-hour rows and reinserts the canonical set.
- Optionally deletes `hour` window_type rows (the SQL script includes this step; it's safe because the backup exists).

How to review safely (recommended steps)

1) Dry-run in Supabase SQL editor (or psql)
   - Open the Supabase SQL editor or connect with psql and run the top section of `cleanup_rate_limits.sql` (the SELECTs) to inspect:
     - total rows
     - how many hour rows exist
     - what groups have duplicates (user_id + window_type)
     - a preview of which rows would be kept

2) Backup (already done by script) but you can additionally export `rate_limits` table as CSV from Supabase.

3) Run the transactional cleanup
   - Once you're satisfied, uncomment and run the transactional block in the SQL script (or run the entire script). It wraps changes in a transaction and creates `rate_limits_backup`.

4) Verify
   - After commit, run the SELECTs again to confirm duplicates are gone and hour rows count is zero.

Restore plan (if needed)

- If you need to restore the original state:
  - TRUNCATE rate_limits;
  - INSERT INTO rate_limits SELECT * FROM rate_limits_backup;

Notes and caveats

- This script keeps the row with the highest `count`. If you'd prefer to keep the row with the soonest expiry, modify the `ORDER BY` clause in the canonical query to order by `expires_at ASC` instead of `count DESC`.
- If your `rate_limits` table contains additional columns or triggers, review and adapt the script to preserve necessary metadata.
- Test the script on a staging copy of your database first before running in production.

If you'd like, I can also:
- Produce a Node.js dry-run script that connects via Supabase client and prints the exact rows that would be deleted/kept (no write). This lets you review with JSON output.
- Prepare a one-click migration that runs from your environment (I will not run it without your approval).
