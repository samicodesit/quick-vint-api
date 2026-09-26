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

- Commit: `97bec9f` in the API/site repository.
- Added tenant-scoped physical items, SKU and barcode aliases, optional sourcing lots, exact minor-unit allocation and audited cost correction. Item and lot cost tables deny direct authenticated reads; API responses filter finance fields by role.
- Added inventory list, draft intake, item detail and lot allocation screens. Drafts need no cost, source, location or photos.
- Checks: `ops:verify` passed with 11 unit, 18 PostgreSQL integration, 10 API and 2 route browser checks, plus type check and build. T03 tests cover concurrent SKU uniqueness, generated-SKU collision, same EAN on two pieces, missing versus zero cost, exact EUR 10.00 split, overrun, cost correction detail, and a second authorised database session. A focused T03 DB rerun passed after adding audit detail.
- External gate: authenticated browser intake, refresh and second-session flows need a local or staging Supabase Auth/PostgREST service. Current browser checks cover routes only. No fixture or SQL shim is claimed as a live Supabase integration.
- Next: T04 inventory query, locations and contextual scanning.

## T04: local search, locations and put-away verified, device gate open

- Added tenant location hierarchy and numeric ordering, indexed cursor search, barcode resolution, versioned item movements and move history. A global scan is a read-only lookup; the named put-away station performs the move. Item and location QR labels contain opaque lookup IDs and no credentials.
- Added URL-backed inventory filters, device-local saved filters, desktop item drawer, keyboard/typed scanner input, camera decoding with ZXing fallback, and responsive station controls. The UI identifies device-local filters as such.
- Checks: `ops:verify` passed with 12 unit, 23 PostgreSQL integration, 11 API and 3 browser checks, plus type check and build. Lint passed. Database checks cover hierarchy cycles, cross-tenant parent rejection, numeric order, occupied delete, stale and repeated moves, wrong custody, cursor pages, role-filtered costs and ambiguous EAN resolution. Browser scan checks use an explicitly labelled auth/API fixture and passed at 390, 768 and 1440 CSS pixels.
- External gates: the browser fixture is not a live Supabase integration. Real camera decoding, label printing and second-device persistence still need physical/manual checks. Indexed search performance on 20,000 items is a later measured gate.
- Next: T05 durable media and phone capture recovery.

## T05: local capture flow verified, live storage gate open

- Added immutable item-scoped capture sessions, manifest-first asset rows, workspace quota, single-use phone pairing with a four-hour upload grant, verified server completion, photo order and retake history. The OS buckets are separate from legacy `temp-uploads`; the Supabase-only storage migration keeps originals and derivatives private and restricts authenticated reads even if an older broad policy exists.
- Added signed TUS upload, server checksum and actual image decode, orientation-safe WebP derivatives, device-local IndexedDB recovery, phone QR pairing, photo controls and a scoped PWA shell. Offline files are labelled as local and cannot be mistaken for verified photos. A real 41,465-byte HEIC sample decoded into a derivative in a one-off local check; the sample was removed after testing.
- Checks: final `ops:verify` passed with 14 unit, 27 PostgreSQL, 13 API and 4 browser checks, plus type check and build. Media DB checks 4/4 and legacy phone-upload/cleanup regression 38/38 passed. Lint passed. The browser capture check uses a labelled auth/API fixture and confirms offline pending state and finish guard.
- External gates: no live Supabase Storage/Auth instance or real phone was available, so signed TUS transfer, private-bucket RLS, capture across two devices and camera/file behavior on iOS/Android still need manual integration checks. No bucket migration or production operation was applied.
- Next: T06 incremental CSV onboarding.
