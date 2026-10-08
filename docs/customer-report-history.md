# Customer report history

The in-app Report an issue button still uses the background telemetry queue and
`POST /api/events/track`. Successful acknowledgement requires a committed write.
Retries reuse the event ID and the existing atomic ingestion receipt.

`2026-10-08_customer_report_history.sql` adds an insert trigger restricted to
`listing_report_submitted` incident groups. In that same ingestion transaction it
saves one small support record in `api_logs`, keyed by the incident ID. Only the
note, category, authenticated account and minimal listing metadata are copied.
Stacks, breadcrumbs, images and generated text remain excluded. This uses the
existing support-log retention policy. Automatic diagnostics still expire after
24 hours. Hourly API-log compaction excludes this report endpoint from both
selection and updates, so it cannot erase support notes. A failed support-record
write rolls back acceptance and can be retried.

The migration also copies any retained report evidence at rollout. Feedback
whose incident evidence was already deleted cannot be recovered from those
tables. Older reports that still exist in `api_logs` are shown directly, without
copying them or sending historical emails again.

The admin's Issues page links to Customer reports at
`/admin/reports?source=customers`. Its authenticated `customer-reports` action
uses exact endpoint filtering, existing indexes and 50-row cursor pagination.
Report detail and account/log actions reuse the existing admin handlers.
Email incident links fall back to the permanent report after diagnostics expire.

Apply the additive migration before deploying the compatible admin/API change.
It creates no tables or indexes and does not rewrite existing ingestion logic.
It does not alter listing, upload, generation, credit or extension code. No new
extension release is required. Roll back the admin/API commit if its UI fails;
leaving the support-record trigger installed continues preserving feedback.

Regression coverage includes durable acceptance failure, lost replies,
deduplication, diagnostic cleanup, safe rendering, cursor precision and expired
email links. Isolated browser checks cover desktop and 390-pixel phone layouts.
