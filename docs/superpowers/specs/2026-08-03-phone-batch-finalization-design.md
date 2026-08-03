# Phone Batch Finalization Design

## Goal

Make a completed v2 phone batch appear on desktop promptly without repeated per-photo signed-URL operations, and keep phone-facing filenames stable.

## Design

The existing `_batch-complete.json` file is the authoritative completion signal when it appears in the session listing. It is written only after the API verifies the exact expected photo count, so the desktop list response may trust it even when Supabase temporarily returns an older `_session.json` body.

An incomplete v2 list response returns ordered photo metadata without signed URLs. Once complete, the API signs every photo path with Supabase's existing `createSignedUrls` bulk operation. Legacy uploads keep their current per-file response behavior.

The desktop waiting panel shows `Finalizing N photos…` after all expected files have arrived but before completion is visible. Its existing stale warning remains for genuinely interrupted handoffs. The phone page continues using compressed timestamped files internally but does not replace the original filename shown to the user.

## Constraints

- Preserve v1 behavior.
- Preserve exact-count completion checks.
- Add no dependencies, database counters, realtime subscriptions, or per-photo metadata writes.
- Continue polling only while the modal is waiting; stop after completion as today.

## Verification

- API regression test: a stale v2 session marker plus `_batch-complete.json` returns `complete: true` and `status: complete`.
- API regression test: incomplete v2 responses perform no signed-URL calls; complete v2 responses use one bulk call.
- Frontend regression tests cover finalizing copy and preservation of the visible original filename.
- Run the backend suite and the frontend deterministic suites.
