# Phone Upload Compression Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe aggregate format, size, compression-route, and browser telemetry to each phone upload summary.

**Architecture:** Reuse each existing in-memory file item to retain optional measurements, then derive one compact object immediately before the existing summary event. All metadata access uses optional/default values and the existing analytics path remains fail-open.

**Tech Stack:** Static HTML/JavaScript phone page, Vitest HTML contract test.

## Global Constraints

- Do not log filenames or photo contents.
- Missing browser APIs and file metadata must normalize to `null`, zero, or an empty object.
- Telemetry must never block or change compression and upload behavior.
- Add no dependency or endpoint.

---

### Task 1: Aggregate phone-upload compression telemetry

**Files:**

- Modify: `src/pages/phone-upload.html`
- Test: `src/pages/__tests__/phoneUploadHtml.test.ts`

**Interfaces:**

- Consumes: existing file items, `trackUploadEvent(event, context)`, `phone_upload_send_summary`
- Produces: `getCompressionSummary(items)` returning the summary payload attached as `compression`

- [x] **Step 1: Write the failing test**

Add one contract test requiring `phone_upload_send_summary` to include `compression: getCompressionSummary(...)`, and requiring the summary to expose original types, size summaries, zero-byte counts, route counts, and nullable browser context.

- [x] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/pages/__tests__/phoneUploadHtml.test.ts`

Expected: FAIL because `getCompressionSummary` and the `compression` summary property do not exist.

- [x] **Step 3: Implement the minimum telemetry**

Add `getCompressionSummary(items)` beside existing tracking helpers. Record selection size/type when file items are created; record pre-compression size, output size, and route during `prepareAndUploadItem`; mark failed preparation in its catch branch. Add the aggregate to batch and single summary events. Parse an upload error response only to retain its server message on the existing error event.

- [x] **Step 4: Run the focused test and verify success**

Run: `npm test -- src/pages/__tests__/phoneUploadHtml.test.ts`

Expected: PASS.

- [x] **Step 5: Review the diff**

Run: `git diff -- src/pages/phone-upload.html src/pages/__tests__/phoneUploadHtml.test.ts`

Confirm no filename telemetry, required browser API, upload sequencing change, or unrelated local edit is included.
