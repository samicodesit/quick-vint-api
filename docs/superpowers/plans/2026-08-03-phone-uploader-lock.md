# Phone Uploader Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one phone tab/device the sole uploader for a v2 QR session and hide the desktop QR after that batch is locked.

**Architecture:** Reuse Supabase Storage's existing atomic `upsert: false` object creation for one immutable uploader lock per session. Keep the uploader ID in phone-tab `sessionStorage`; do not add database tables, caches, dependencies, or per-photo lock calls.

**Tech Stack:** TypeScript/Vercel API, Supabase Storage, browser JavaScript, Vitest, Playwright.

## Global Constraints

- Preserve the legacy v1 upload contract unchanged.
- Add at most one normal storage write per v2 batch; conflict retries may read the existing lock.
- Keep different QR session IDs fully independent.
- Do not add dependencies.

---

### Task 1: Acquire one uploader per v2 session

**Files:**

- Modify: `api/phone-upload.ts`
- Test: `src/api/__tests__/phoneUpload.test.ts`

**Interfaces:**

- Consumes: `action=prepare&v=2&sessionId=<uuid>&expectedCount=<n>&uploaderId=<uuid>`
- Produces: `${sessionId}/_uploader.json`; HTTP 200 for the owner and 409 for a different uploader.

- [ ] **Step 1: Write failing API tests** for first acquisition, same-owner retry, different-owner rejection, and exclusion of `_uploader.json` from photo counts.
- [ ] **Step 2: Run `npx vitest run src/api/__tests__/phoneUpload.test.ts`** and confirm the new assertions fail.
- [ ] **Step 3: Add the minimal uploader-lock marker and prepare-time acquisition**, using `upsert: false` and the existing storage client.
- [ ] **Step 4: Run `npx vitest run src/api/__tests__/phoneUpload.test.ts`** and confirm it passes.

### Task 2: Give each phone tab a stable uploader ID

**Files:**

- Modify: `src/pages/phone-upload.html`
- Test: `src/pages/__tests__/phoneUploadHtml.test.ts`

**Interfaces:**

- Consumes: browser `sessionStorage` and `crypto.randomUUID()`.
- Produces: `state.uploaderId` and the `uploaderId` prepare query parameter.

- [ ] **Step 1: Write a failing source-contract test** for a session-scoped uploader ID and prepare query parameter.
- [ ] **Step 2: Run `npx vitest run src/pages/__tests__/phoneUploadHtml.test.ts`** and confirm it fails.
- [ ] **Step 3: Add the uploader ID to v2 phone-page state and prepare requests** without changing v1 requests.
- [ ] **Step 4: Run `npx vitest run src/pages/__tests__/phoneUploadHtml.test.ts`** and confirm it passes.

### Task 3: Hide a locked batch QR on desktop

**Files:**

- Modify: `quick-vint/content.js`
- Test: `quick-vint/tests/e2e/extension.spec.js`

**Interfaces:**

- Consumes: existing `lockBatchComputerControlsForPhone()` transition.
- Produces: removal of `.batch-qr` once the server reports `expectedCount > 0`.

- [ ] **Step 1: Extend the existing expected-count E2E test** to require `.batch-qr` to disappear.
- [ ] **Step 2: Run the focused Playwright test** and confirm the assertion fails.
- [ ] **Step 3: Remove `.batch-qr` inside `lockBatchComputerControlsForPhone()`** while preserving the receiving title and cancel behavior.
- [ ] **Step 4: Run the focused Playwright test** and confirm it passes.

### Task 4: Verify and integrate

**Files:**

- Modify: none.

**Interfaces:**

- Consumes: Tasks 1-3.
- Produces: deployable backend commit and reloadable frontend main.

- [ ] **Step 1: Run `npm run verify:production` in `quick-vint-api`.**
- [ ] **Step 2: Run the complete frontend unit, E2E, and build gate.**
- [ ] **Step 3: Commit backend and frontend changes separately.**
- [ ] **Step 4: Push/deploy the backend, confirm the production alias, and smoke-test one owned session plus cleanup.**
