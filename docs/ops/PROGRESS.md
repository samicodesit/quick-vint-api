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

- Commit: `e88f327` in the API/site repository.
- Added tenant-owned queue, SQL claim/lease/retry functions, transition events, a protected worker endpoint, local worker launcher, queue counts and capability-safe adapters.
- Checks: `ops:verify` passed: 8 unit, 10 PostgreSQL integration, 8 API and 1 browser check, plus type check and build. A separate worker process finished a committed fixture job. PostgreSQL tests cover dedupe, concurrent claim, expired lease, retry exhaustion and revoked membership. Adapter, worker and endpoint tests cover unsupported capabilities and authentication.
- External gate: production scheduler cadence and function budget are unverified. Vercel's documented Hobby cron interval is once daily; no cron was configured or deployed. No provider capability was labelled live.
- Next: T03 physical identity, intake and acquisition lots.

External gates: no production database migration, live Vinted credential test, physical device/printer test, seller pilot or deployment has been authorised or run.

## T03: local intake and lots verified, live session gate open

- Added tenant-scoped physical items, SKU and barcode aliases, optional sourcing lots, exact minor-unit allocation and audited cost correction. Item and lot cost tables deny direct authenticated reads; API responses filter finance fields by role.
- Added inventory list, draft intake, item detail and lot allocation screens. Drafts need no cost, source, location or photos.
- Checks: `ops:verify` passed with 11 unit, 18 PostgreSQL integration, 10 API and 2 route browser checks, plus type check and build. T03 tests cover concurrent SKU uniqueness, generated-SKU collision, same EAN on two pieces, missing versus zero cost, exact EUR 10.00 split, overrun, cost correction detail, and a second authorised database session. A focused T03 DB rerun passed after adding audit detail.
- External gate: authenticated browser intake, refresh and second-session flows need a local or staging Supabase Auth/PostgREST service. Current browser checks cover routes only. No fixture or SQL shim is claimed as a live Supabase integration.
- Next: T04 inventory query, locations and contextual scanning.
