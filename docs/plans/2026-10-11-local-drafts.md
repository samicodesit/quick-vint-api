# Browser drafts for the MVP

User-approved direction: preserve photo preparation, single and batch generation,
editing, copying, and the same-device draft library. Store prepared JPEGs and
drafts in account-scoped IndexedDB instead of cloud draft tables or a draft
bucket. Clearing site data loses these drafts; there is no cross-device sync.

Reuse existing authenticated generation, usage enforcement, idempotency, and
temporary phone-upload storage with its existing cleanup. Keep current limits.
Do not deploy, drop database objects, migrate production data, or change billing.

Implementation and verification:

1. Add transactional browser storage behind the current workspace contract.
   Test persistence, account separation, optimistic conflicts, grouping, capacity,
   deletion, and storage failures before integrating it.
2. Save generation attempts locally before sending them. Reuse prepared-photo
   uploads and the existing generation endpoint. Persist exact request inputs
   and use a read-only lookup of existing retry records for recovery. Never replay
   generation to check a result. Block uncertain expired attempts from silently
   regenerating. Save successful results before cleaning up temporary uploads.
3. Bind storage lifetime to the workspace. Release object URLs on deletion and
   disposal. Make local-save scope clear without adding a crowded warning.
4. Run deterministic browser checks for local persistence, single and batch
   flows, error recovery, mobile layout, overlays, and startup. Run the existing
   build, type, format, lint, and unit-test checks. Record what was verified.

Execute inline under the user's explicit instruction to implement this direction.
