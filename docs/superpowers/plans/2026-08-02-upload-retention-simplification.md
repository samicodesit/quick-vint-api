# Upload Retention Simplification Implementation Plan

> **For agentic workers:** Execute inline with `superpowers:executing-plans`; do not delegate or commit.

**Goal:** Bound temporary upload resources with a one-hour rolling idle window, immediate terminal deletion, and a minimal UI hint.

**Architecture:** Keep the existing storage-backed v2 marker while active. Every successful upload refreshes `expiresAt`; cancel or expiry deletes the entire session prefix. Missing v2 sessions continue to return the existing expired response, so no tombstone is required.

**Tech Stack:** Vercel TypeScript API, Supabase Storage, static phone-upload HTML, Chrome MV3 content script, Vitest, Playwright.

## Global Constraints

- No database migration, dependency, rewrite, commit, or deployment.
- Exact UI copy: `Expires after 1 hour idle.`
- Preserve v1 behavior.

### Task 1: Storage lifetime and cron security

**Files:**

- Modify: `api/phone-upload.ts`
- Modify: `api/cron/daily-cleanup.ts`
- Test: `src/api/__tests__/phoneUpload.test.ts`
- Test: `src/api/__tests__/dailyCleanup.test.ts`

- [ ] Add failing tests for one-hour signed URLs, whole-prefix cancel/expiry deletion, direct cron deletion, and unauthorized cron rejection.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Change active-session idle and signed-URL TTLs to one hour.
- [ ] Remove tombstone writes and delete all session objects on cancel/expiry.
- [ ] Make hourly cleanup delete every object in an expired v2 prefix.
- [ ] Return `401` before cleanup work when `CRON_SECRET` is missing or wrong.
- [ ] Run focused API tests until green.

### Task 2: Minimal expiry hint

**Files:**

- Modify: `src/pages/phone-upload.html`
- Modify: `src/pages/__tests__/phoneUploadHtml.test.ts`
- Modify: frontend `content.js`
- Test: frontend `tests/e2e/extension.spec.js`

- [ ] Add failing phone-page and Chromium assertions for the exact short hint.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Show the hint once on the v2 phone action bar and once in desktop phone/batch QR views.
- [ ] Keep the hint muted and avoid countdown logic.
- [ ] Run focused tests until green.

### Task 3: Regression verification

- [ ] Run API tests, lint, format check, type-check, and build.
- [ ] Run extension unit tests and focused real-browser QR, phone, batch, and dropzone checks.
- [ ] Run the full Playwright suite if focused checks pass.
- [ ] Confirm no migration files or commits exist.
