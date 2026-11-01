# Saved draft edit tracking

The active mobile web workspace uses `LocalDraftStore` (browser IndexedDB).
The feature-gated server draft API is a different, inactive path. This change
requires no production database migration and does not enable that API.

Successful generations keep an original title/description with their operation
ID in the existing account-specific local draft row. The original is excluded
from normal draft views. Older rows without this evidence are not reconstructed.
Regeneration replaces the original and starts a new observation budget.

Both text fields must be visible and editable before recording exposure.
Successful local saves schedule a checkpoint after 20 seconds of inactivity.
Leaving the editor or hiding the tab can record the reserved final checkpoint.
An atomic IndexedDB claim limits each generation to one exposure and three edit
snapshots across tabs and reopening. Unchanged saves produce no edit event.
Conflicts and failed saves cannot produce successful-save evidence. Disposal
cancels pending work; transport verifies the current authenticated owner.

Each checkpoint compares the latest saved text against the original. Full undo
remains an observed edit. Originals older than seven days cannot produce another
snapshot. Quick exits, offline delivery, unsaved edits and saves beyond the cap
can be missed. No observed edit does not establish acceptance.

The existing authenticated event endpoint receives bounded snapshots. Existing
redaction, truncation markers and seven-day text retention apply. Admin log-detail
provides the review text. `generationRequestId` matches the operation ID so the
collector can join the authenticated owner to the exact committed reservation.
Modes `saved_draft` and `saved_draft_batch` distinguish this editor from immediate
results and extension forms. Reports keep delayed saved-edit follow-up separate.

There is no polling or request on every keystroke. Generation keeps the baseline
in its existing local transaction. Only bounded checkpoints read the single
draft row; they do not read photo blobs or block saves on a network response.
Server latency does not measure typing latency.

Regression coverage includes real IndexedDB transactions, concurrent tabs,
reopening, full undo, stale saves, account separation, expiration, regeneration,
debouncing, cancellation, authenticated event storage and the intercepted local
browser journey. Run the production gate and `scripts/test-local-browser-drafts.mjs`
with `DRAFT_BROWSER_TRACKING_ONLY=1` and the fixture configuration documented in
`browser-drafts-release.md`. This focused run stops after generation, editing,
navigation and reopening assertions. All external services are intercepted.

The broader legacy browser script currently stops in its later billing section:
it expects one-time credits alongside monthly radios and an obsolete credit CTA.
Current billing separates these choices into tabs. That unrelated assertion was
not treated as a tracking regression or silently reported as a passing full run.
