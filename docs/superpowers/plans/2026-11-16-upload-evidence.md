# Upload evidence correction

Goal: make the already emitted manual-upload phases correlate with actual server storage results without changing upload, auth or generation behavior.

The extension already hashes its manual session ID. Production ingestion only preserves that key for registered phone sessions, so an authenticated manual phase loses the bounded correlation. Start and completion phases also lack retained business summaries. One original auth diagnostic has independently arrived five hours late, so an absent primary record is not proof of permanent logging loss.

Implementation stays in existing endpoints and logging. No migration, permissions, new service, paid inference, customer contact or UI change.

- [x] Reproduce the missing manual hash/phase summary with the real ingestion endpoint and isolated database. Add endpoint regressions for authenticated manual phases, anonymous/foreign ownership and invalid metadata.
- [x] Preserve only the hashed manual session, operation, finite phase counts and receipt times as an authenticated bounded SYSTEM summary. Do not assign phone identity or trust upload completion from a client claim.
- [x] Capture a bounded server storage result only after successful multipart storage, using the same hash, file orders, sizes and content hashes. Runtime logging must be fail open and omit session IDs, filenames, paths, credentials and images.
- [x] Repeat loaded released-extension upload/close/recovery checks against the actual local handler where applicable, three times. Distinguish controlled transport from the historical trigger.
- [ ] Run targeted endpoint checks and full production gates, inspect the combined diff, commit owned files and serialize established production delivery. Verify the actual deployment and retained natural evidence separately.
- [x] Preserve historical upload uncertainty and remaining auth gaps. Record exact late auth owner/client/version proof and update the investigation ledger.

Review: performed inline under the explicit no-subagent instruction. Checked authenticated ownership, correlation-only hashes, invalid scalar types/counts, bounded error and drop metadata, atomic deduplication, privacy, fail-open logging and upload latency. Review findings were covered by failing regressions and corrected. Full gate: 1780 passed, 23 skipped. Six actual-handler browser checks passed. Typical 2 MiB request median overhead was about 1 ms with no additional storage calls.
