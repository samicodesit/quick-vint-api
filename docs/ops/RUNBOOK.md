# Local OS runbook

This runbook is for an isolated local/test database. It does not authorize production migrations or deployment.

1. Start PostgreSQL on loopback. Create a disposable database named `ops_test_` followed by 32 lowercase hexadecimal characters.
2. In that database, create the test `auth.uid()` shim and `authenticated`/`service_role` roles as shown in `tests/ops/integration/psql.ts`. Apply `migrations/2026-09-26_ops_core.sql`, then `migrations/2026-09-26_ops_jobs.sql`. The DB tests do this automatically in a fresh temporary database.
3. Set `OPS_TEST_PSQL` to a local `psql` executable and `OPS_TEST_PGPORT` to the isolated cluster port. Run `npm run ops:test:db`. The test harness creates and drops only its own `ops_test_` database.
4. To create labelled fixture workspaces in a separate disposable database, set `OPS_ENV=test`, `OPS_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/ops_test_<32-hex>` and `OPS_TEST_PSQL`, then run `npm run ops:seed`. The script refuses other database names, remote hosts and production mode.
5. Run `npm run ops:worker` with the same local/test variables to process queued fixture jobs. It uses the same `runWorker` handlers as the protected API entry point. Output contains counts, not job payloads.
6. Run `npm run ops:verify` with the test database variables. The existing site/legacy check remains `npm run verify:production`; a pre-existing unrelated design document currently fails its formatting stage.

The `/api/ops-worker` endpoint requires a separate `OPS_WORKER_TOKEN` and accepts POST only. It returns run and queue counts. Configure a scheduler only after checking the actual Vercel plan, function limits and desired cadence. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) currently allow daily Hobby jobs and minute-level Pro jobs. No production invocation was configured.

## Analysis configuration

Production extraction remains disabled until an operator explicitly sets `OPS_AI_ENABLED=true`, `OPS_AI_MODEL`, `OPS_AI_MAX_INPUT_TOKENS`, `OPS_AI_MAX_OUTPUT_TOKENS`, `OPS_AI_INPUT_RATE_MINOR_PER_MILLION`, `OPS_AI_OUTPUT_RATE_MINOR_PER_MILLION`, `OPS_AI_RATE_EFFECTIVE_DATE` and the existing `OPENAI_API_KEY`. The workspace also needs an enabled `ops_ai_entitlements` row with a nonzero budget and an approved `openai` mode. Neither an existing listing credit nor a fixture entitlement silently enables this service. An unavailable service yields manual fact entry. Do not enable a model until `npm run ops:eval-ai -- <owner-approved-manifest> --release` passes with at least 100 permitted real garments and the measured quality is reviewed. The repository's default manifest is synthetic and cannot pass that gate.

## Backup, restore and rollback

The local restore check is `tests/ops/integration/restore.test.ts`. It uses `pg_dump` from the isolated PostgreSQL cluster, restores into a second disposable database, checks the queued job, replays its dedupe key and claims it. This verifies database queue reconstruction only. It does not test Supabase Storage, a live Auth session or production backup tooling.

For a future approved release, take a consistent database backup and private Storage export before any migration. Record migration version, database snapshot ID, media manifest and deployed commit together. Restore into a separate environment first, then compare item, order, job, exception, media and audit counts. Check private media objects by exact path and checksum. Rebuild application reads from the restored tables; never regenerate physical item IDs or replay marketplace writes to validate a restore.

Rollback starts by disabling the OS feature flag, worker scheduler, AI dispatch and official marketplace capabilities. Keep the existing site and extension on their prior release while inspecting the affected workspace. Do not delete new tables to roll back application code. If a database restore is required, isolate writes, restore database and media from the same checkpoint, verify queue and idempotency records, then reconcile any external actions performed after the checkpoint before resuming workers. Marketplace and payment effects cannot be undone by database restore. This runbook is a procedure for owner review, not authorization to run it against production.

## Local release checks

Run `npm run ops:verify` with the isolated PostgreSQL variables. Run `npm run ops:test:perf` separately for the 20,000 item synthetic fixture. Run `npm test`, `npm run lint`, `npm run type-check` and `npm run build` for the API/site, and `npm run verify:production` for the extension. Browser screenshots in `docs/ops/screenshots` use fixture authentication and API data. See `RELEASE_GATES.md` for what those checks do and do not prove.
