# Phone Auto-Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Immediately transfer each v2 phone gallery selection, append later selections to the active desktop workflow, and terminate the phone UI when an existing desktop action locks the session.

**Architecture:** Keep the current storage-backed session marker, uploader lock, compression, retry queue, and desktop polling. The owning phone tab may monotonically increase `expectedCount`; desktop polling requests signed URLs only for a newly completed wave using `fromOrder`, then the existing desktop Done/Generate actions call the exact-count complete endpoint as the irreversible lock. A lightweight status request lets the visible phone page detect that lock without listing or signing photos.

**Tech Stack:** TypeScript Vercel API, Supabase Storage, inline browser JavaScript/CSS, Chrome MV3 content script, Vitest, Playwright.

## Global Constraints

- Preserve all legacy v1 behavior.
- Phone copy never exposes separate upload, finalization, or send-to-desktop stages.
- No database counters, realtime subscriptions, per-photo metadata writes, dependencies, or repeated full-session URL signing.
- The owning uploader may increase expected count only; locking is exact-count and irreversible.
- Keep existing compression, bounded concurrency, automatic retries, cancellation, expiry, and uploader ownership.

---

### Task 1: Appendable v2 storage protocol

**Files:**
- Modify: `api/phone-upload.ts`
- Test: `src/api/__tests__/phoneUpload.test.ts`

**Interfaces:**
- Consumes: existing `V2SessionMarker`, `_uploader.json`, `handlePrepare`, `handleList`, and `handleComplete`.
- Produces: `GET action=status`; `GET includeUrls=1&fromOrder=N`; monotonic same-uploader `prepare`.

- [ ] **Step 1: Write failing API tests**

Add focused tests proving:

```ts
it("lets the owning v2 uploader increase expected count", async () => {
  mockV2Session({ status: "uploading", expectedCount: 2 });
  // Existing uploader marker contains uploaderId; prepare requests 5.
  // Expect 200 and the rewritten session marker to contain expectedCount: 5.
});

it("rejects a v2 expected-count decrease", async () => {
  mockV2Session({ status: "uploading", expectedCount: 5 });
  // Same uploader requests 4. Expect 409 and no session-marker write.
});

it("signs only a completed wave from fromOrder", async () => {
  mockV2Session({ status: "uploading", expectedCount: 5 });
  // Storage has orders 0..4; GET includeUrls=1&fromOrder=2.
  // Expect one createSignedUrls call for orders 2..4 and three returned files.
});

it("returns terminal v2 status without listing files", async () => {
  mockV2Session({ status: "complete", expectedCount: 5 });
  // GET action=status returns { status: "complete", complete: true }.
  // Expect listMock not to have been called.
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/api/__tests__/phoneUpload.test.ts`

Expected: the increase request returns 409, incremental URL response lacks URLs, and status requests use the ordinary list handler.

- [ ] **Step 3: Implement the minimum protocol changes**

In `handlePrepare`, acquire/verify the uploader before accepting a changed count. Reject `expectedCount < marker.expectedCount`; for a larger count, update the existing session marker, activity time, and expiry with one `writeV2Session` call. Equal counts remain idempotent.

Route `GET action=status` to a handler that validates the v2 session ID, reads/ages the marker, and returns only:

```ts
{
  v: 2,
  status: marker.status,
  complete: marker.status === "complete",
  expectedCount: marker.expectedCount,
}
```

In `handleList`, when `includeUrls === "1"`, filter photo files to `order >= fromOrder`, sign that subset once with `createStoredFileResponses`, and retain the session's total `count` and `expectedCount` in the response. Reject invalid or negative `fromOrder` with 400. Ordinary incomplete polls continue returning metadata without URLs.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run src/api/__tests__/phoneUpload.test.ts`

Expected: all phone-upload API tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/phone-upload.ts src/api/__tests__/phoneUpload.test.ts
git commit -m "Support appendable phone upload sessions"
```

### Task 2: Phone auto-upload and terminal UI

**Files:**
- Modify: `src/pages/phone-upload.html`
- Test: `src/pages/__tests__/phoneUploadHtml.test.ts`

**Interfaces:**
- Consumes: Task 1 `prepare`, upload, and `action=status` responses.
- Produces: automatic v2 upload waves; `renderTerminalSuccess()`; clear CTA states.

- [ ] **Step 1: Replace stale contract assertions with failing behavior contracts**

Assert the HTML contains these exact production behaviors and no v2 Send copy:

```ts
expect(html).toContain("setTimeout(sendBatchFiles, 0)");
expect(html).toContain("Adding ${active} of ${total}…");
expect(html).toContain("Add more photos");
expect(html).toContain("Retry ${failed} failed photo");
expect(html).toContain("Photos added on your computer");
expect(html).toContain("You can close this page.");
expect(html).not.toContain("Send ${state.files.length} photo");
```

Also assert v2 row markup renders a passive `.upload-complete` check rather than a `.remove-photo` button, and that visible-page status checks call `action=status`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/pages/__tests__/phoneUploadHtml.test.ts`

Expected: old explicit-send and removable-row assertions fail.

- [ ] **Step 3: Implement one serialized upload-wave flow**

Keep `sendBatchFiles` as the sole v2 queue runner, but stop calling `completeUpload` from it. `handleFiles` appends files, calls `prepareExpectedCount`, then schedules `sendBatchFiles` immediately. A second selection is accepted only after the active wave ends; `nextOrder` preserves append order.

Render CTA states from existing item flags:

```js
if (state.isSending) `Adding ${active} of ${total}…`;
else if (failed) `Retry ${failed} failed photo${failed === 1 ? "" : "s"}`;
else if (total) "Add more photos";
else "Choose photos";
```

Use the existing purple button and animation for active transfer, a solid red retry state, and a quiet green ready status. For v2 rows, render a non-button status slot; successful uploads replace it with `✓`. Keep v1 row controls unchanged.

Add `checkSessionStatus()` on initial load, before opening the picker, and every three seconds only while the v2 page is visible. Pause checks while hidden and resume immediately on visibility/focus. If status is complete, replace the container contents with the two-line terminal success screen and stop the timer plus all file/cancel/session interaction. The status-only endpoint reads one marker and never lists or signs photos.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run src/pages/__tests__/phoneUploadHtml.test.ts`

Expected: all phone-page contracts pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/phone-upload.html src/pages/__tests__/phoneUploadHtml.test.ts
git commit -m "Start phone uploads on selection"
```

### Task 3: Incremental single-listing consumption

**Files:**
- Modify: `quick-vint/content.js`
- Test: `quick-vint/tests/e2e/extension.spec.js`

**Interfaces:**
- Consumes: Task 1 list metadata plus `includeUrls=1&fromOrder=N`, and existing `injectFilesIntoVinted` append capture.
- Produces: `lockPhoneUploadSession(sessionId)` used by existing Done and Done + Generate actions.

- [ ] **Step 1: Write one failing Playwright scenario**

Extend the existing loaded-MV3 phone scenario so the first incomplete response reports two metadata files with `expectedCount: 2`, the incremental URL request returns those two signed files, a later response grows to three, and a second incremental URL request returns only order 2. Assert three photos are injected in two waves and no full set is downloaded twice. Click existing Done and assert one exact-count complete request is made before modal cleanup.

- [ ] **Step 2: Run the focused scenario and verify RED**

Run: `npx playwright test tests/e2e/extension.spec.js --grep "appends completed phone upload waves"`

Expected: no files inject because current polling requires `data.complete === true`.

- [ ] **Step 3: Implement incremental fetch and desktop lock**

Treat `receivedCount === expectedCount` as a completed wave, not a completed session. Request `includeUrls=1&fromOrder=${downloadedFiles.size}` only when the metadata count has grown beyond downloaded files, then pass only new files through the existing download/injection path.

Add `lockPhoneUploadSession(sessionId)` that POSTs the current exact expected count and orders to `action=complete&v=2`. Make Done await this lock before closing; make Done + Generate await it before generation. Keep buttons disabled while metadata, downloads, or the lock are pending. Preserve the existing incomplete-close confirmation for a partially received wave.

- [ ] **Step 4: Run focused and nearby phone tests**

Run: `npx playwright test tests/e2e/extension.spec.js --grep "phone upload"`

Expected: incremental append, delayed thumbnails, retries, close behavior, and generation scenarios pass.

- [ ] **Step 5: Commit in the frontend repo**

```bash
git add content.js tests/e2e/extension.spec.js
git commit -m "Append phone photos before desktop lock"
```

### Task 4: Incremental batch grouping

**Files:**
- Modify: `quick-vint/content.js`
- Test: `quick-vint/tests/e2e/extension.spec.js`

**Interfaces:**
- Consumes: Task 1 incremental list responses and existing batch grouping/discard UI.
- Produces: growing ungrouped batch gallery and exact lock before `startBatchGeneration`.

- [ ] **Step 1: Write one failing Playwright scenario**

Simulate a first completed wave of two signed files and a later third file. Assert the organizer opens after the first wave, the third file appears ungrouped without resetting existing groups or selection, and incremental URL requests use `fromOrder=0` then `fromOrder=2`. Starting generation must make one exact-count complete request before opening work tabs.

- [ ] **Step 2: Run the focused scenario and verify RED**

Run: `npx playwright test tests/e2e/extension.spec.js --grep "appends phone waves to batch grouping"`

Expected: grouping waits for `data.complete === true` and does not append later files.

- [ ] **Step 3: Reuse the existing gallery renderer for new files**

When metadata count equals the current expected count and exceeds `batchRemoteFiles.length`, fetch only `fromOrder=${batchRemoteFiles.length}` with URLs, append normalized new files, preload them, and either open grouping for the first wave or append their tiles to the current ungrouped grid. Do not rebuild group state.

Before `startBatchGeneration`, call the same exact-count complete endpoint. Disable generation while received count differs from expected count or the lock is in flight. A successful lock leaves current grouping and generation behavior unchanged; a 409/410 shows the existing actionable error and starts no work tabs.

- [ ] **Step 4: Run focused batch tests**

Run: `npx playwright test tests/e2e/extension.spec.js --grep "batch"`

Expected: append, grouping, discard, capacity, signed-URL refresh, and generation tests pass.

- [ ] **Step 5: Commit in the frontend repo**

```bash
git add content.js tests/e2e/extension.spec.js
git commit -m "Append phone waves to batch grouping"
```

### Task 5: Production gates and integration

**Files:**
- Verify only; update this plan's checkboxes with results if needed.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: pushed backend and frontend main branches ready for owner testing.

- [ ] **Step 1: Run backend gate**

Run: `pnpm test && pnpm build`

Expected: all backend tests and the production build pass.

- [ ] **Step 2: Run frontend gate**

Run: `npm run test:ci`

Expected: unit tests, all deterministic Playwright tests, and `build:prod` pass.

- [ ] **Step 3: Inspect final diffs**

Run in both repos: `git status --short --branch`, `git diff --check`, and `git log --oneline origin/main..HEAD`.

Expected: only the planned commits; the unrelated frontend `docs/superpowers/plans/2026-08-02-robust-phone-batch-upload.md` remains untouched and untracked.

- [ ] **Step 4: Push without manual deployment**

Run in each repo: `git push origin main`.

Expected: both branches synchronize with origin. Do not run Vercel deployment commands.
