# Durable web batches: backend proposal

Status: design proposal, not implemented or deployed. The separate web UI increment is testable without this backend change. It must continue to tell sellers to keep AutoLister open while preparing.

## Seller experience

Start once, wait for the required photos and batch to be accepted, then review ready items or switch to Vinted. Accepted remaining items keep processing independently of the browser. Returning retrieves saved results and real progress. Never automatically replace a reviewed item or infer a listing was published from copying text.

## Current gap

`DraftQueue` runs inside the page. `createDraftClient` reads each item's original JPEGs from account-scoped IndexedDB and uploads that item's photos immediately before its generation. The backend's existing generation-result lookup can recover a started request, but does not start later queued items. Browser suspension can therefore delay the remaining queue. Neither an HTTP acknowledgement nor Vercel `waitUntil` alone establishes durable execution after a worker dies.

## Required persistence

A new migration would add two account-scoped tables, restricted to the service role and accessed only through authenticated owner-checked endpoints:

- Batch: ID, owner ID, unique owner/request key, input fingerprint, status, creation/expiry times, cancellation time and item totals.
- Batch item: batch ID, ordinal, stable generation request ID, frozen settings and photo references, input fingerprint, queued/running/succeeded/failed/cancelled state, lease owner/expiry, retry eligibility, result/error, timestamps and the attributable generation reservation ID.

No bearer tokens or raw photo bytes belong in job records, browser telemetry or logs. Listing drafts remain local to the browser. A batch result is temporary recovery data, not an implicit cloud-draft sync feature.

## Admission and execution

1. Validate the signed-in account, item count (existing 20-item limit), current entitlement and request idempotency. Validate photo ownership, complete uploads, frozen item settings and total limits. Persist the entire accepted manifest atomically before presenting it as accepted.
2. Only accepted items may run. Trigger an immediate worker on the existing platform, with a scheduled recovery sweep for abandoned leases. Recheck current account entitlement, cancellation and photo validity before each new item. Bound per-account concurrency and preserve the existing model/rate limits.
3. Refactor the existing generation core behind its current auth/entitlement/idempotency contracts. A server job must not impersonate a user through a retained bearer token, use the service role as a public client, bypass credit reservation, or call a parallel simplified generation path.
4. Claim each item atomically. Persist its stable request ID and exact generation input before provider execution. An uncertain prior attempt is reconciled using that identity and the existing reservation/result evidence, not regenerated with a new ID. Do not promise provider-level exactly-once execution where the provider has no such contract.
5. Commit a successful result and its existing charge outcome before marking the item complete. Stop new starts on cancellation, sign-in/account restrictions or non-retryable input failures. Cancellation does not pretend to undo a provider request already running; reconcile that item's result and credit outcome.
6. Temporary photo cleanup must respect accepted, active batch ownership. Reuse existing storage only where ownership and retention can be enforced. An explicit expiry must produce a truthful stopped state rather than expired URLs sent to the provider. Select and approve the retention/deletion window before implementation.
7. Authenticated GET status/results and POST cancel check the owner every time. Returning or reloading imports completed results into the same local draft IDs without overwriting newer seller edits. Unrelated accounts never receive a job's status, photos, outputs or credit details.

## Verification and delivery gates

- Endpoint-level owner isolation, manifest validation, idempotency, cancellation and entitlement tests.
- Real local database concurrency tests for duplicate submissions, competing workers, expired leases, restart after provider success and restart before result persistence.
- Worker processing that actually continues after the browser process exits. A mocked UI status is insufficient.
- Browser tests for local draft/photo retention, old signed URLs, lost responses, partial acceptance, reload, multi-tab edits and account changes.
- Actual iPhone tests: switch to Vinted while several items remain, lock the screen, terminate/reopen the browser, lose and restore connectivity. Compare exact item IDs, outputs and attributable ledger/reservation outcomes.
- Existing full integration/build gates and a production rollout with public-artifact verification. No paid generation or live marketplace action without its separate authorization.

## Approval boundary

The earlier monitoring instructions require explicit approval for new migrations/services. This proposal therefore does not create a migration, database table, cron worker or new storage policy. Before implementation, confirm the new job tables, the worker/recovery schedule supported by the deployed plan, temporary photo/result retention and any needed storage policy change. Existing extension execution and delivery remain outside this feature.
