# AutoLister OS progress

Local branches: `feature/autolister-os-build` in both repositories. No deployment or live marketplace/payment action.

## T00: code verified

- Commit: `57bb9b2` in the API/site repository.
- Scoped Astro/React host, auth-aware shell, local flag, seed safety guard and browser route check.
- Checks: route/seed unit 3/3, full API suite 369/369, type check, build and route browser check 1/1 passed. Extension baseline 51 unit and 174 E2E passed, with build.
- Existing API `verify:production` stops at format check on unrelated pre-existing `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`. Its lint, type check and build passed. Full API tests were run separately.
- Next: T01 database and authorisation kernel.

## T01: local code and schema verified, live auth gate open

- Commit: `00da58d` in the API/site repository.
- Added tenant tables, RLS, transactional workspace bootstrap, server-side gateway, current membership checks, workspace setup UI and isolated test seed.
- Checks: `ops:verify` passed: 2 unit, 4 PostgreSQL integration, 6 API and 1 browser check, plus type check and build. The browser check covers route safety, not an authenticated workspace journey.
- External gate: no local Supabase Auth/PostgREST test service is configured. Database integration tests use real PostgreSQL with simulated `auth.uid()` claims. No production migration was applied.
- Next: T02 durable jobs and adapter boundary.

## T02: local code and database flow verified, scheduler gate open

- Added tenant-owned queue, SQL claim/lease/retry functions, transition events, a protected worker endpoint, local worker launcher, queue counts and capability-safe adapters.
- Checks: `ops:verify` passed: 8 unit, 10 PostgreSQL integration, 8 API and 1 browser check, plus type check and build. A separate worker process finished a committed fixture job. PostgreSQL tests cover dedupe, concurrent claim, expired lease, retry exhaustion and revoked membership. Adapter, worker and endpoint tests cover unsupported capabilities and authentication.
- External gate: production scheduler cadence and function budget are unverified. Vercel's documented Hobby cron interval is once daily; no cron was configured or deployed. No provider capability was labelled live.
- Next: T03 physical identity, intake and acquisition lots.

External gates: no production database migration, live Vinted credential test, physical device/printer test, seller pilot or deployment has been authorised or run.
