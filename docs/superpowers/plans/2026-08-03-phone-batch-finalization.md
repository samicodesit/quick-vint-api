# Phone Batch Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale completion delays and repeated per-photo signing from v2 phone batch polling while keeping user-facing filenames stable.

**Architecture:** Reuse the existing immutable completion marker and Supabase bulk signing API. Keep the current polling and upload protocol; change only how v2 list responses derive completion and when URLs are created.

**Tech Stack:** TypeScript, Vitest, browser JavaScript, Playwright/static HTML contract tests, Supabase Storage.

## Global Constraints

- Preserve v1 behavior and exact-count completion checks.
- Add no dependencies, counters, realtime systems, or per-photo metadata writes.
- Keep compressed names internal and original selected names visible.

---

### Task 1: V2 completion and URL response

**Files:**

- Modify: `api/phone-upload.ts`
- Test: `src/api/__tests__/phoneUpload.test.ts`

**Interfaces:**

- Consumes: existing `_batch-complete.json`, `listSessionFiles`, and Supabase Storage `createSignedUrls(paths, ttlSeconds)`.
- Produces: unchanged list response shape; incomplete v2 files may omit `url`, complete files include it.

- [ ] Add a failing test where `_session.json` says `uploading` but `_batch-complete.json` exists; expect `complete: true` and `status: "complete"`.
- [ ] Add a failing test that incomplete v2 listing does not sign files and complete v2 listing calls `createSignedUrls` once.
- [ ] Run `pnpm exec vitest run src/api/__tests__/phoneUpload.test.ts` and confirm the new assertions fail.
- [ ] Make the completion marker authoritative and bulk-sign complete v2 file paths while preserving legacy signing.
- [ ] Run the focused test and commit the backend behavior.

### Task 2: Honest finalization copy and stable displayed names

**Files:**

- Modify: `../quick-vint/content.js`
- Test: `../quick-vint/tests/e2e/extension.spec.js`
- Modify: `src/pages/phone-upload.html`
- Test: `src/pages/__tests__/phoneUploadHtml.test.ts`

**Interfaces:**

- Consumes: existing `batchExpectedCount`, `batchRemoteFiles`, `batchIsComplete`, and `item.originalFile`.
- Produces: `Finalizing N photos…` while received equals expected; original visible filename remains unchanged.

- [ ] Add failing assertions for finalizing copy and absence of visible compressed-name replacement.
- [ ] Run the focused tests and confirm they fail for the intended reason.
- [ ] Add the smallest conditional waiting copy and remove the three-line visible rename block.
- [ ] Run focused frontend/backend page tests and commit each repository's UI change.

### Task 3: Verification

**Files:**

- Verify only.

**Interfaces:**

- Consumes: both repository diffs.
- Produces: fresh test and build evidence.

- [ ] Run the complete backend test suite.
- [ ] Run frontend unit tests and deterministic Playwright suite.
- [ ] Inspect `git diff --check`, repository status, and final diffs without touching unrelated untracked files.
