# AutoLister OS progress

Local branches: `feature/autolister-os-build` in both repositories. No deployment or live marketplace/payment action.

Local task commits in the API/site repository: T00 `57bb9b2`, T01 `00da58d`, T02 `e88f327`, T03 `97bec9f`, T04 `dcfd40d`, T05 `f6fb879`, T06 `479db22`, T07 `4e6ea1c`, T08 `879a518`, T09 `2b13a44`, T10 `fe7b135`, T11 `c058170`, T12 `26e0ab1`, T13 `50e59fe`, T14 `c95a880`, T15 `add1797`, T16 `9eac9da`, T17 `b35f65a`, T18 `0a7cc42`. The extension T09 commit is `a3c5290` in its separate repository.

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

## T11: manual orders and reservation locally verified, provider ingress gated

- Added immutable order-line snapshots, exact external order IDs, issue records and active item reservations. The manual order screen scans one physical item at a time and requires a human payment confirmation before release. Owner, manager and lister may create; warehouse staff may reserve confirmed orders. Revenue fields are withheld from non-financial roles at the gateway.
- Provider snapshot ingestion uses a service-only function, a stable account/order identity, exact item references and an observed timestamp. Duplicate and older events do not duplicate lines or revenue; unknown provider lines create mapping issues and block reservation. Official polling and webhook-to-ingestion remain disabled until T10 account access is verified.
- Checks: PostgreSQL order tests 5/5 passed, including two concurrent reservations of the same garment, bundle rollback, unpaid refusal, exact 64-bit ID and unmapped-line refusal. The 390-pixel manual-order browser fixture passed from scan through reservation with no horizontal overflow. This browser fixture is not a live Supabase Auth/PostgREST test.
- External gate: no Vinted dev account or live Supabase Auth/PostgREST browser session was available. No real sale or payment action occurred.
- Next: T12 persisted pick waves, worker claims and item/tote checks.

## T12: pick waves and station locally verified

- Added persisted single-order and batch pick waves, location-sorted tasks, distinct batch tote codes, five-minute worker claims, exact item/tote verification, missing-item exceptions and order-safe rereads. The phone-width pick station can reload a wave and continue the same valid claim. Reading the next task makes no stock mutation.
- Checks: PostgreSQL pick tests 3/3 passed for wrong item/tote, one-time verification, cancellation, missing-item issue and reclaim after lease expiry. The 390-pixel browser fixture passed wave creation, claim, reload, scan and verification without horizontal overflow. Type check and lint passed. The browser uses labelled auth/API fixtures, not live Supabase.
- External gate: real scanner hardware and multi-device Supabase Auth/PostgREST persistence remain unverified. No production operation was applied.
- Next: T13 packing, labels and physical handover.

## T13: packing and local dispatch code verified, physical print gate open

- Added pack sessions, one scan per picked order line, order-bound private PDF labels, a private `ops-labels` bucket migration, tenant/role-checked upload and 60-second label links, and explicit shipment handover. Attaching or opening a label never dispatches. The handover transaction requires every line scanned and a matching label, then moves item custody to outbound and releases reservations. Existing labels can be reopened for reprint without a new revision.
- Checks: PostgreSQL pack tests 2/2 passed for bundle completeness, duplicate scan, wrong-order label, repeated handover and cancellation before dispatch. A 390-pixel browser fixture passed the two-item scan, label upload/attach and handover path with no horizontal overflow. Type check and lint passed. The browser fixture does not verify live Supabase Storage.
- External gates: physical print legibility and print-dialog cancellation require H01 device testing. Live private storage upload/download, provider label retrieval and a real carrier handover remain unverified. No shipping action or production migration occurred.
- Next: T14 return receipt, inspection, quarantine and cancellation reconciliation.

## T14: return custody and cancellation locally verified

- Added exact-garment receipt into quarantine, separate inspection and manager restock, preserved order-line snapshots, refund observations and after-handover cancellation exceptions. Restock returns the same item ID to on-hand stock and invalidates its listing approval.
- Checks: PostgreSQL return tests 3/3 passed for refund before receipt, wrong garment, partial bundle, duplicate receipt, damaged quarantine, same-ID restock and late cancellation. The 390-pixel return browser fixture passed receipt, inspection and approval without page overflow. Type check and lint passed; lint has two existing import-order warnings in T10 files.
- External gates: no real refund, carrier return, provider cancellation event or live authenticated Supabase flow was performed. Browser authentication and API data were labelled fixtures.
- Next: T15 location stocktake and discrepancy resolution.

## T15: location counts locally verified

- Added one open count per location, expected item/version snapshots, deduplicated exact-code observations, a movement-aware comparison, manager-only audited discrepancy resolution and explicit count close. A moved item is shown as changed, and stale stock cannot be written off from the old count.
- Checks: PostgreSQL stocktake tests 4/4 passed for overlap, duplicate scans, movement during count, warehouse write-off denial and restart after close. The 390-pixel count-station browser fixture passed start, scan and compare without page overflow. Type check and lint passed before the close operation; PostgreSQL tests passed again after close was added.
- External gates: actual scanning hardware and live authenticated multi-user persistence remain unverified. Browser authentication and API data were labelled fixtures.
- Next: T16 contribution ledger, reports and exports.

## T16: contribution ledger and report locally verified

- Added sale-time acquisition snapshots for new order lines, append-only seller cost and refund observations with source-key dedupe, exact minor-unit contribution calculations, labelled equal allocation of unobserved bundle line revenue, distinct-item source/lot cohorts and a CSV matching report rows. Explicit zero cost remains known; unknown cost keeps contribution incomplete. Mixed currencies stay separate. Buyer fees are excluded from seller revenue. A resold garment contributes one acquired item to cohort counts and charges acquisition once across its sales history.
- Checks: contribution unit tests 6/6, PostgreSQL finance tests 2/2, 390-pixel report/export browser fixture 1/1 and type check passed. Lint passed with two import-order warnings in T10 files. The browser report is a labelled fixture; its numbers are not live integration evidence.
- External gates: no provider fee/refund feed or live Supabase reporting session was available. No actual refund or payment action occurred. Existing order lines predating this migration retain unknown acquisition basis because historical sale-time cost cannot be reconstructed from current stock values.
- Next: T17 team administration, privacy and operational controls.

## T17: team and privacy controls locally verified, live services gated

- Added 48-hour email-matched single-use invitations, owner-only membership changes and last-owner protection. Gateway membership is reread on each request, and the analysis worker now rejects a revoked requester before provider work. The owner screen manages invitations, members, AI budget, retention, encrypted credential metadata, recent jobs, exceptions, provider freshness and deletion requests. A branded Resend template and send integration remain disabled by default.
- Added tenant-scoped paged database export, operator account/workspace export scripts with private media downloads, an approval-gated workspace deletion executor, exact-prefix storage cleanup and opt-in retired-media retention cleanup. The existing legacy account deletion script now stops before any deletion when active OS memberships remain. No account or workspace data was deleted outside the isolated test database. Account erasure after membership resolution still follows the existing privacy process and requires an operator review of retained business audit records.
- Checks: PostgreSQL admin tests 8/8 passed for invite email match, replay, expiry, revocation, last owner, tenant-scoped retention, redacted exports, encrypted credential RPC and reviewed local deletion. Unit tests 4/4 passed for template, encryption and revoked queued analysis. The 390-pixel settings browser fixture passed. Type check and lint passed; lint has two T10 import-order warnings. Four new operator scripts passed `node --check`. Browser authentication and data were labelled fixtures.
- External gates: live Auth/PostgREST, private Storage export/cleanup, Resend sender/domain, credential key custody, provider freshness and privacy approval are unverified. Invitation mail is disabled and no customer email was sent. No live deletion, credential change or production migration occurred.
- Next: T18 integrated journey, performance, regression and release gates.

## T18: local code verified, external release gates open

- Commit: `0a7cc42` in the API/site repository. Branch `feature/autolister-os-build` in both repositories.
- Added an integrated isolated PostgreSQL journey from CSV intake and capture manifest through human listing review, manual handoff, two-item sale, reservation, pick, pack, handover, partial return, quarantine, manager restock and fresh approval on the same physical item ID. The upload binary and external handoff are fixtures. Added database backup/restore with queued-job and dedupe verification, plus an expired-session API refusal check.
- Checks before final review: `npm run ops:verify` passed 49 unit, 67 PostgreSQL, 23 API and 13 browser checks, type check and Astro build. `npm test` passed 392/392 after correcting the T00 route assertion to the current React hydration directive. API lint passed with no warnings after correcting the import order. Extension `npm run verify:production` passed 51 unit, 175 E2E and build. The restore test passed 1/1, the 20,000-item performance fixture passed 1/1, and targeted report/return browser fixture checks passed after screenshots were added. Five labelled fixture screenshots are in `docs/ops/screenshots` after the review follow-up.
- Performance: the final local PostgreSQL 12 single-run database execution times were 0.094 ms for the first 100 items, 0.112 ms for a later page and 0.056 ms for exact SKU lookup. See `PERFORMANCE.md`; staging HTTP p95 and physical scan feedback were not measured.
- External gates: `RELEASE_GATES.md` records live Supabase Auth/Storage, H01 real devices, H02 official Vinted account capabilities, H03 labelled AI evaluation, H04 seller pilot and H05 owner deployment review as unverified. No production migration, deployment, customer email, live marketplace/payment action or purchase occurred. The legacy API `verify:production` format stage still fails on the unchanged unrelated design document described above.
- Next: perform a single final read-only review pass, fix material findings, then hand over the local branches and gate matrix. No production action is included.

### Single final review follow-up

- The one read-only reviewer found four material gaps: return inspect/restock retry safety, label attachment retry safety, missing Today work queue and missing garment identity context in inventory rows. The sole implementation writer addressed them locally.
- Return and label commands now record payload-bound results and replay them after state advances; changed payloads conflict. Focused PostgreSQL pack, return and journey tests passed 6/6. Today now reads bounded workspace orders, issues, exceptions, listing work, open photo sessions and official connection freshness; manual orders can record a ship-by time. Inventory rows now include an imported or approved short title and a private, short-lived signed thumbnail when an available derivative exists.
- Focused orders/import/inventory/listing/journey PostgreSQL tests passed 22/22, Today ordering unit 1/1 and the 390-pixel Today and inventory browser fixture 1/1. New fixture screenshots are `today-mobile-fixture.png` and `inventory-mobile-fixture.png`. Live Supabase Auth, private Storage signing and provider freshness remain unverified external gates.
- Final checks after review fixes: `npm run ops:verify` passed 50 unit, 68 PostgreSQL, 23 API and 14 browser fixture tests, plus type check and Astro build. `npm test` passed 392/392; lint passed without warnings. `npm run ops:test:perf` passed the 20,000-item fixture 1/1. Full `format-check` fails only on the unchanged legacy design document. Extension verification remains the earlier passing 51 unit, 175 E2E and build because its files did not change in this follow-up.
- Next: local commit and handover. H01 to H05 remain open external gates.
