# Acquisition Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist bounded first-touch acquisition data and report TikTok and other source cohorts through signup, activation, and paid outcomes.

**Architecture:** The site captures an allowlisted attribution object in localStorage. The website auth callback submits it directly to a bearer-authenticated API endpoint while preserving the existing extension handoff payload and auth behavior. A Supabase table keyed by user id is joined with profiles and generation logs for the admin cohort report.

**Tech Stack:** Astro, browser JavaScript, Chrome Manifest V3 extension, Vercel API handlers in TypeScript, Supabase Postgres, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-22-tiktok-attribution-design.md`

## Global Constraints

- Capture only allowlisted source, medium, campaign, content, timestamp, and referrer hostname.
- Never store email, IP address, arbitrary URLs, browser fingerprints, or arbitrary query parameters in attribution.
- Use first touch only and do not overwrite an existing attribution.
- Treat missing attribution as unknown and cross-device or store handoff loss as unobservable.
- Do not change auth credentials or release the extension. Production migration and application release follow the approved release-readiness procedure below.

## Review Focus

- A hostile query string or referrer must be rejected or reduced to safe enum and slug fields. Test in `utils/__tests__/attribution.test.ts`.
- A malformed localStorage value or storage exception must not block page tracking. Test in `src/scripts/__tests__/attribution.test.ts`.
- The callback claim uses only a fixed same-origin endpoint, sanitized fields, and the authenticated bearer owner. A failed claim must not block the existing extension handoff. Test in `src/pages/__tests__/authCallbackBridge.test.ts`.
- A second claim or an existing account must not be relabeled as a new acquisition. Test in `src/api/__tests__/attributionClaim.test.ts` and `utils/__tests__/attributionReport.test.ts`.
- A generation failure or missing profile must not be counted as activation or paid. Test in `utils/__tests__/attributionReport.test.ts`.

### Task 1: Sanitized attribution contract

**Files:**

- Create: `quick-vint-api/utils/attribution.ts`
- Test: `quick-vint-api/src/api/__tests__/attributionClaim.test.ts`
- Test: `quick-vint-api/utils/__tests__/attribution.test.ts`
- Test: `quick-vint-api/utils/__tests__/attributionReport.test.ts`

**Interfaces:**

- Produces `sanitizeAttribution`, `parseAttributionInput`, `isNewAcquisition`, and `buildAttributionReport`.

- [ ] Write failing tests for allowlists, oversized fields, timestamps, insert-only semantics, new versus existing users, successful generation activation, and paid status.
- [ ] Run the focused Vitest files and confirm they fail for missing exports.
- [ ] Implement the pure sanitizer and report functions without database or browser dependencies.
- [ ] Run the focused Vitest files and confirm they pass.

### Task 2: Website capture and TikTok entry path

**Files:**

- Create: `quick-vint-api/src/scripts/attribution.js`
- Modify: `quick-vint-api/src/scripts/analytics.js`
- Create: `quick-vint-api/src/pages/tiktok.astro`
- Test: `quick-vint-api/src/scripts/__tests__/attribution.test.ts`

**Interfaces:**

- Produces `captureFirstTouch`, `readStoredAttribution`, and `getStoredAttribution` for the auth callback bridge.

- [ ] Write failing tests for first write, non-overwrite, malformed storage, storage exception, UTM parsing, and TikTok referrer fallback.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Implement the browser helper, invoke capture from analytics initialization, and add a fixed `/tiktok` redirect.
- [ ] Run the focused test and the existing analytics or page tests.

### Task 3: Website auth callback claim

**Files:**

- Modify: `quick-vint-api/public/auth-callback.js`
- Test: `quick-vint-api/src/pages/__tests__/authCallbackBridge.test.ts`

**Interfaces:**

- `POST /api/attribution/claim` receives the stored sanitized record and the callback session bearer. `AUTH_HANDOFF` retains its existing payload.

- [x] Write tests for sanitized callback data, unchanged handoff payload, and claim failure not blocking auth.
- [x] Implement a short, best-effort same-origin claim with timeout and storage cleanup.
- [x] Run the focused callback test.

### Task 4: Authenticated claim API and database migration

**Files:**

- Create: `quick-vint-api/migrations/2026-09-22_user_attributions.sql`
- Create: `quick-vint-api/api/attribution/claim.ts`
- Test: `quick-vint-api/src/api/__tests__/attributionClaim.test.ts`

**Interfaces:**

- `POST /api/attribution/claim` accepts `{ attribution }` with a Supabase bearer token and returns `{ ok, alreadyAttributed }`.

- [ ] Write failing endpoint tests for missing bearer, owner mismatch, invalid attribution, first insert, and duplicate insert.
- [ ] Run focused endpoint tests and confirm failure.
- [ ] Implement CORS, bearer identity lookup, sanitizer, and insert-only database write.
- [x] Trigger the claim from the website auth callback with best-effort error handling.
- [ ] Run the endpoint and existing extension auth suites.

### Task 5: Admin cohort report

**Files:**

- Modify: `quick-vint-api/api/admin/index.ts`
- Modify: `quick-vint-api/src/pages/admin.html`
- Test: `quick-vint-api/src/api/__tests__/attributionReport.test.ts`
- Test: `quick-vint-api/src/pages/__tests__/adminHtml.test.ts`

**Interfaces:**

- `GET /api/admin?action=attribution-report&days=30` returns source and campaign cohorts plus TikTok and overall totals with captured, newSignups, activated, activePaidProfiles, and nonNewClaims counts. Unknown and cross-device limits are explicit in the response.

- [ ] Write failing report and HTML tests for TikTok rows, unknown profiles, and existing-user exclusion.
- [ ] Run the focused tests and confirm failure.
- [ ] Query attribution, profiles, and generation logs, build the report, and add a compact Acquisition section to the Users view.
- [ ] Run the focused API and admin HTML tests.

### Task 6: Full deterministic verification

**Files:**

- Modify: `quick-vint-api/docs/superpowers/plans/2026-09-22-acquisition-attribution.md`

- [ ] Run API lint, type-check, build, format-check, and test commands.
- [x] Confirm no extension source or test diff remains from the attribution change. Existing extension auth tests remain unchanged.
- [x] Inspect the diff, migration ordering, and release dependency notes.
- [x] Record exact verification results for the parent worker; production release follows the approved release-readiness procedure below.

## Release readiness and execution record

The local verification gate passed before this readiness review: lint, type-check, static build, formatting, and 70 Vitest files containing 365 tests. Before release, `GET https://autolister.app/tiktok` returned Vercel `404 NOT_FOUND`, `OPTIONS https://autolister.app/api/attribution/claim` returned `404 NOT_FOUND`, and an unauthenticated `GET /api/admin?action=attribution-report&days=30` returned `401 Unauthorized`. No live tagged signup, activation, or paid-user QA has been run, and no fake account or event was created.

The migration is additive for a fresh production schema. `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ENABLE ROW LEVEL SECURITY` make a rerun safe when the existing object matches this definition. The primary key on `user_id` makes the claim insert-only; the API treats a duplicate key as `alreadyAttributed` and preserves the original first touch. `IF NOT EXISTS` does not reconcile an incompatible pre-existing table, so inspect the production schema before applying it. The migration must be applied before the API or admin code is deployed. The repository has no migration runner or Supabase project configuration, so use the existing authorized production Supabase migration procedure and record the result rather than guessing a local command.

The user applied the exact migration in Supabase project ref `jqloiovdwjaornnfvmyu` and received `Success. No rows returned`. A service-role read-only probe then confirmed the expected attribution columns are queryable with zero rows. No attribution record was manufactured for verification. The probe did not independently inspect the index or RLS metadata; the migration result is the evidence for those statements.

For the approved release, prepare an attribution-only commit. Stage the files in Tasks 1 through 5, the attribution spec, and this plan. In particular, the code scope is `api/attribution/claim.ts`, `api/admin/index.ts`, `migrations/2026-09-22_user_attributions.sql`, `public/auth-callback.js`, `src/api/__tests__/adminAttributionReport.test.ts`, `src/api/__tests__/attributionClaim.test.ts`, `src/pages/__tests__/adminHtml.test.ts`, `src/pages/__tests__/authCallbackBridge.test.ts`, `src/pages/admin.html`, `src/pages/tiktok.astro`, `src/scripts/analytics.js`, `src/scripts/attribution.d.ts`, `src/scripts/attribution.js`, `src/scripts/__tests__/attribution.test.ts`, `src/utils/__tests__/attribution.test.ts`, `src/utils/__tests__/attributionReport.test.ts`, and `utils/attribution.ts`. Keep unrelated working-tree changes such as `AGENTS.md` and `docs/growth-current-sprint.md` out of that commit. Run `npm run verify:production` from `/home/mests/projects/quick-vint-api` after staging the exact scope.

The linked hosting project is Vercel project `quick-vint-api` from `.vercel/project.json`, with production alias `autolister.app`. After the migration succeeds and the approved commit is on `main`, run the existing release command `npm run push:production` from `/home/mests/projects/quick-vint-api`. Wait for the Vercel deployment to become Ready and Current for the production alias. Then perform read-only smoke checks for `/tiktok`, the claim endpoint `OPTIONS` response, and the authenticated admin acquisition report. A real tagged signup and first generation remain an optional operator-approved QA step; until one is run, report the cohort as instrumented but unverified.

If the deployment needs to be rolled back, revert the attribution-only release commit on `main`, rerun `npm run verify:production`, and use `npm run push:production` to restore the previous application behavior. Leave `public.user_attributions` in place so collected rows are preserved and the old application can ignore the additive table. Do not drop the table or delete rows as part of an application rollback. If the migration fails before application deployment, stop the release, leave the current application untouched, and correct or rerun the migration only after schema review.
