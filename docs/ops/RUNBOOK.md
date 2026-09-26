# Local OS runbook

This runbook is for an isolated local/test database. It does not authorize production migrations or deployment.

1. Start PostgreSQL on loopback. Create a disposable database named `ops_test_` followed by 32 lowercase hexadecimal characters.
2. In that database, create the test `auth.uid()` shim and `authenticated`/`service_role` roles as shown in `tests/ops/integration/psql.ts`. Apply `migrations/2026-09-26_ops_core.sql`, then `migrations/2026-09-26_ops_jobs.sql`. The DB tests do this automatically in a fresh temporary database.
3. Set `OPS_TEST_PSQL` to a local `psql` executable and `OPS_TEST_PGPORT` to the isolated cluster port. Run `npm run ops:test:db`. The test harness creates and drops only its own `ops_test_` database.
4. To create labelled fixture workspaces in a separate disposable database, set `OPS_ENV=test`, `OPS_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/ops_test_<32-hex>` and `OPS_TEST_PSQL`, then run `npm run ops:seed`. The script refuses other database names, remote hosts and production mode.
5. Run `npm run ops:worker` with the same local/test variables to process queued fixture jobs. It uses the same `runWorker` handlers as the protected API entry point. Output contains counts, not job payloads.
6. Run `npm run ops:verify` with the test database variables. The existing site/legacy check remains `npm run verify:production`; a pre-existing unrelated design document currently fails its formatting stage.

The `/api/ops-worker` endpoint requires a separate `OPS_WORKER_TOKEN` and accepts POST only. It returns run and queue counts. Configure a scheduler only after checking the actual Vercel plan, function limits and desired cadence. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) currently allow daily Hobby jobs and minute-level Pro jobs. No production invocation was configured.
