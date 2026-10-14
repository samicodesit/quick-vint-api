# Web authentication activity cleanup

Status: implemented and verified locally. Owner approved the production push on October 14. Deployment acceptance is recorded separately.

The reported two authentication rows were separate app initializations, 44 seconds apart, in the same browser visit. Both contained `method: session`. The app incorrectly reused `auth_complete` for restoration. Two upload rows corresponded to two photos; one generation succeeded. Customer identities are omitted.

## Changes

- Reserve `auth_complete` for successful email-code, Google and email-link verification. Callback telemetry starts after verification, avoiding a PKCE initialization race. Navigation waits at most 500 ms for background event enqueueing.
- Emit `session_restored` once per account and browser visit in a tab. Successful sign-in satisfies that confirmation. Coalesce concurrent checks; retry failed enqueueing; fall back to memory when storage is blocked.
- The admin's mixed/event timeline excludes routine restoration by default. Show background events restores the full stream. Historical `auth_complete` with `method: session` is labeled Session restored. Errors and flagged records remain visible.
- Filter in the database before pagination and apply the same predicate to counts. Select only the method field, rather than loading full request bodies for list rows. Raw API log reads keep their existing forensic behavior.
- Preserve unique authenticated-user reporting and homepage cohort account/payment attribution with the new event. Keep uploads, app views, generation, copies, billing and error evidence. Reuse the existing batched, durable transport.

## Verification

- Baseline: 964 tests passed, 3 opt-in tests skipped.
- Final production gate: lint, types, build, formatting and 979 tests passed; 3 opt-in tests skipped.
- Regression tests cover reloads, account/visit changes, concurrent checks, failed enqueueing, blocked storage, successful callback methods, verification failure, stalled telemetry, historical labels, filter/count consistency and reporting continuity.
- Local production-build Chromium journey: response-loss retry uses the original ID; reload preserves browser/visit identity; persisted login emits one restoration and no fresh sign-in; verified ownership and payload privacy checks pass. No customer generation requests were sent.
- Admin Chromium: 1440 and 390 px; background toggle, historical labels, visible failure, pagination and three modal open/close cycles each pass. Zero browser errors and production requests. Screenshots were inspected locally.
- Read-only production query validates the proposed JSON filter and compact method alias: HTTP 200, nine raw records versus seven activity records, retaining the one generation.

## Limits

No historical rows were changed. Real Google/email authentication was not exercised; callback orchestration is covered with controlled local tests. If browser storage stalls beyond the bounded enqueue window, navigation continues and the sign-in event may be unavailable. No prompts, generation defaults, pilot assignment, credentials or customer accounts were changed.
