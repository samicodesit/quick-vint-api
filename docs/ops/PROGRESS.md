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

## T06: local CSV onboarding verified, live session gate open

- Added persisted CSV files and raw rows, five-row preview, mapped values and provenance, account-scoped external IDs, dry-run identity conflict checks, checkpointed 100-row application, explicit status per row and spreadsheet-safe result export. Matching uses external ID then unique physical identifier. Title or image similarity never merges pieces. External image references stay unresolved; imports make no AI calls.
- Added a responsive import screen and API upload gate. It keeps cost and location optional, distinguishes missing cost from zero, shows pending or conflicting rows, and resumes an import through its URL. Imported sale text is labelled as unreconciled on item detail.
- Checks: `ops:verify` passed with 17 unit, 30 PostgreSQL, 16 API and 5 browser checks, plus type check and build. Lint passed. A real local PostgreSQL fixture completed 4,000 rows in 100-row batches with no cost or location. Tests cover same-run replay, overlapping external ID, preserved human cost correction, dry-run identity conflict, invalid money and formula escaping. The browser import check uses a labelled auth/API fixture.
- External gate: authenticated browser import against a live Supabase Auth/PostgREST service and a seller CSV trial remain unverified. No production migration or customer file was used.
- Next: T07 bounded extraction and AI usage accounting.

## T07: bounded extraction code and local database checks

- Added opt-in workspace AI entitlement, revision-scoped analysis runs, selected evidence, a three-attempt dispatch ledger, usage entries and one debit per completed logical result. One SQL transaction validates proposals, settles a successful dispatch and records usage. Timeout or lost-response billing remains explicitly uncertain with budget reserved.
- Added strict field and evidence validation, eight-image selection, an untrusted-image prompt, structured Responses payload, 12-second provider timeout, no SDK retries, explicit model/rate/token configuration, and a manual response when inference is disabled. Fixture dispatch is restricted to local/test and clearly labelled. The worker rechecks membership before dispatch.
- Added a synthetic software fixture manifest and an evaluation script. Its two examples verify software accounting only and fail the 100 real owner-approved garment release gate.
- Focused checks: analysis PostgreSQL 3/3, extraction unit 4/4, analysis API 2/2, type check passed. The external OpenAI call, Supabase Storage/Auth flow and 100-garment quality evaluation were not run. No production inference, migration or spend occurred.
- Next: T08 human fact confirmation, deterministic listing renderer and review UI. The AI proposal path never writes confirmed item facts.

## T08: confirmed facts and listing review locally verified

- Added revisioned human-confirmed facts, editable templates for EN, NL, FR, DE, PL, ES and IT, deterministic listing text, immutable draft snapshots and explicit approval. A fact or photo revision change invalidates a ready draft. Existing snapshots remain available for audit, and an unchanged fact confirmation does not invalidate approval.
- Added a compact item review screen with signed derivative evidence, visibly unconfirmed AI suggestions, manual fact confirmation, price and locale preview, draft save, exact-revision approval, ready queue and template settings. AI suggestions only fill local form inputs when clicked. Owners, managers and listers can review; warehouse staff cannot.
- Checks: `ops:verify` passed after the EN/PL update, including listing renderer 9/9 unit, listing and handoff PostgreSQL 4/4, listing API 2/2, browser review 1/1, type check and build. The browser flow is an explicitly labelled fixture. Screenshots were inspected at desktop and 390-pixel mobile width, including no horizontal overflow. No live authenticated Supabase review was claimed.
- Next: T09 extension handshake and manual handoff.

## T09: local manual and extension handoff verified with fixtures

- Added an approved-revision packet with title, description, confirmed facts, price, reference and short-lived signed original-photo links. The API rejects stale fact/photo revisions or a listing that is no longer ready. A durable handoff acknowledgement records only `prepared` or `filled`; neither state marks the marketplace listing live.
- Added a versioned `OPS_HELLO`/`OPS_PREPARE_LISTING` bridge. The extension accepts the existing exact site origin only from `/app`, checks its signed-in account, fetches the same approved packet under its own bearer session and verifies workspace/item/listing/revision identity. Its current Vinted selector path fills title and description only on one open new-listing form. Price, photos, category, condition and final publication remain manual. No host permissions were expanded.
- Checks: API `ops:verify` passed with 33 unit, 34 PostgreSQL, 20 API and 5 browser checks, plus type check and build; lint passed. Extension unit suite passed 53/53. Its full browser suite had 174 passes and one outdated manifest assertion; after updating the assertion, the focused five-test rerun passed, including the manifest check. The OS browser fixture keeps a manual packet prepared and marketplace status unverified.
- External gate: no live extension-to-site authenticated handoff or live Vinted form was used. The form fixture proves only the currently supported selectors. No listing was published.
- Next: T10 current official Vinted contract verification and recoverable adapter.

## T10: official contract implementation local, account capability gate open

- Pinned Vinted Pro Integrations OpenAPI v0.360.0 from `https://pro-docs.svc.vinted.com/downloads/api.yml` with SHA-256 `d79338ab2f1a3be0c3817a1d45b5d5f5f773996eaba62848ad2354821adbe831`. Implemented documented HMAC request and raw-body webhook signatures, sandbox/production hosts, ontology version checks, item slot refusal, asynchronous create receipts, exact int64 order IDs, order/label reads, paged item reference reconciliation and a disabled-by-default official adapter.
- Added tenant-scoped connection, event and publication persistence plus a raw webhook endpoint. Duplicate raw deliveries collapse by connection and body hash. Webhooks are stored as reconciliation evidence and cannot directly mutate stock. No account credentials or capability flags were configured. The ordinary adapter factory still returns unsupported marketplace actions.
- Checks so far: Vinted contract unit 6/6 and PostgreSQL event persistence 1/1 passed; type check passed. The public documentation's example signature differs from an independently computed HMAC for its stated `foo,bar` token and body, so the unit test asserts the documented algorithm with a reproducible computed digest instead of treating that sample digest as proof. This discrepancy needs a sandbox request before enabling capabilities.
- External gate: Vinted says the Pro API and portal are restricted to allowlisted Pro businesses. An allowlisted dev-mode account, separate dev access token, webhook signing key, account-specific slot evidence and live contract checks are unavailable here. No Vinted request or listing action was made. T11 manual orders can proceed independently.
- Next: T11 exact manual order ingestion and atomic reservation.
