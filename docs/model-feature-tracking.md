# Model and tutorial adoption tracking

Release requirement approved November 1, 2026: supply tracking before go-live.

Use the existing durable first-party event transport and account attribution. No new SDK, tracking table, UI or permission. Model events contain only bounded action facts, entry point, mode and an opaque operation ID. Do not send appearance choices, image URLs, images, prompts or listing content.

## Coverage

- Model invitation: shown, opened, dismissed. The extension toolbar badge counts as an invitation exposure once per account/page when visible. Web toolbar exposure and the separate invitation use distinct entry points.
- Model view and setup: opened, setup started, skipped, pre-auth preferences saved (the preferences themselves are excluded).
- Creation: requested, accepted, completion observed and failure observed. Polls and focus refreshes do not repeat outcomes within a mounted view. An already-ready model is not a new completion. A request failure is distinct from a failed accepted operation.
- Enable/disable: reported only after a successful server response, including the extension's on-page switch.
- Listing photos: an admitted job observed by the client, with single/batch/existing-listing context where available. This is not proof of new paid generation. Reused jobs are counted once by operation ID in reports.
- Extension tutorial: invitation offered, started from invitation/help, skipped, completed, or interrupted. Replay is a new start, not a new user. Version is v1. Dismissal remains account-scoped local state.

## Interpretation

Client events are observations and can be absent when a tab closes, storage fails or a connection is lost. Use distinct authenticated accounts for adoption and distinct operation IDs for jobs. Pre-auth web steps are anonymous and must not be presented as identified people or merged by guesswork. The transport deduplicates repeated delivery by event ID. Account-bound events are dropped if the account changes before enqueueing.

Use user_models and user_model_attempts as the authoritative creation outcome and cost records, including completions while the UI is closed. Use listing_photo_jobs and listing_photo_attempts for suitability, queue/recovery, validation, generation cost and latency. Attachment is a client observation, not proof of publication, customer acceptance, fit or accuracy. Never infer Vinted publication from these events.

Read-only reports: ops/model-feature-adoption.sql and ops/listing-model-photo-monitoring.sql. Adoption and reliable operation are separate measures. Do not claim funnel conversion from independently aggregated daily counts; use the explicitly ordered cohort query. No data is backfilled for interactions before this release.

## Release verification

Draft photo imports retain three concurrent workers. They emit one `upload_complete` summary per import attempt, with `phase: local_import`, successful and failed photo counts, and the import ID. This event means local draft storage finished, not a server upload. A partial import is explicitly marked partial. Retrying an import creates another attempt summary; count distinct import IDs when measuring imports. Network upload tracking remains separate. The admin feed labels these summaries as photos added to drafts.

The staging rehearsal found that production `daily_stats.date` is text. Photo admission and cost reservation compare against `current_date::text`; the database regression fixture uses the actual text schema so both paths are exercised.

Run the feature browser tests, website queue/account-isolation tests, event endpoint tests, required production gates, and an authenticated staged event ingestion with database readback. Record staging evidence in the release ledger before enabling production.
