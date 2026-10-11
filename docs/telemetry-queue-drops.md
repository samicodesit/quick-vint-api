# Telemetry queue drop investigation

The health counter `client_dropped` counts telemetry records removed locally,
not failed listings or affected users. The server increments it when a new
accepted event carries `context.queueDropped`. Receipt deduplication prevents
a retry of that event from counting twice. The UTC budget day is the receipt
day, not necessarily when a record was discarded.

On 2026-10-09 the counter rose from 8 to 65. The 57-record increase has no
retained carrier in the day's business logs or current incident examples.
The bounded production investigation read 127 rows and 112 event details.
No specific discarded event, cause or affected customer can be recovered from
that aggregate. This is not proof of failed listing, photo upload or generation,
nor proof that every discarded record was routine.

Before this fix, some checkpoint events stored only the aggregate. Business
logs did retain `queueDropped` when the carrier was selected for logging, but
internal-account logs were excluded. Do not repeat the earlier incorrect claim
that all business logs discarded the field.

## New evidence

The queue reports counts for expiry (24 hours), capacity (200 records or
512 KiB) and terminal rejection. It separately counts critical records and
`listing_report_submitted` records, and includes the last terminal rejection
reason. Network failures and retryable identity/capacity rejections retain the
record and do not themselves count as drops. Capacity eviction still prefers
routine records. Product requests, limits, retry schedule and report handling
are unchanged.

Old persisted totals are explicitly `queueDroppedUnclassified`. Missing new
fields, or a positive unclassified count, cannot establish that no critical
record was lost. Metadata reports only removals observed by the queue; it is
not an inventory of every missing browser event or unavailable storage write.

The accepted carrier commits a diagnostic log in the existing ingestion
transaction, including its ID, source, client version and occurrence time.
Those attributes describe the carrier, not necessarily the discarded records
or their owners. Aggregate counts cannot establish the affected-user count.
Normally unlogged checkpoints use `/event/telemetry_queue_dropped`; existing
business carriers keep their normal endpoint. Internal-account carriers keep
only transport metadata, excluding email, page, IP, user agent and product
context. Receipt-level owner correlation is retained as before.

## Scheduled investigation

When the health total changes, use bounded `view-logs` and `log-detail` for
carrier metadata. Include ordinary event endpoints as well as the special
diagnostic endpoint. Follow pages until a short page, since planned row counts
can underestimate `pagination.totalPages`. Also inspect changed incident
examples when a critical event carried the metadata.

Classify known routine expiry separately from critical/customer-report loss.
Use the last rejection reason and source/release to trace code when justified.
Do not equate record counts with user counts or close unrelated incidents.
Diagnostic logs remain subject to normal compaction; checkpoint compact
findings before expiry. New reason evidence requires the updated website asset
or extension package. Older clients remain compatible but cannot supply causes
they never measured. Do not fabricate reasons for the historical 57 records.

## Repeated diagnostic rows on 2026-10-09

The screenshot window (21:00 to 21:30 UTC) initially contained 65 retained
diagnostic rows with 65 distinct transport IDs. All were `token_refresh_start`
carriers from extension 1.4.10, each reporting one discarded record. Their
occurrence times ranged from 18:39:59 to 21:04:28 UTC; receipt times were later.
These are delayed records, not 65 failed listings or duplicate retries of one ID.
This client predates the reason counters. The actual discarded event types and
reasons remain unavailable. Later receipts continued arriving during review.

The correlated retained trail contained 88 distinct refresh operations with
only an authenticating checkpoint and no retained completion. This does not
prove that 88 refresh requests failed, that a listing failed, or why the live
network request stalled. It materially strengthens the need to bound auth I/O.
Local tests of the packaged SDK and extension worker reproduced a pending auth
request and verified that the correction aborts it after 20 seconds, retains
the stored session on a transient error, records the restoration failure and
does not make three further refresh calls after that error. Ordinary auth
responses, caller cancellation and confirmed invalid-token sign-out are covered.

The admin All logs view groups consecutive diagnostic rows for the same known
actor on the current page. Expand the group for every original record. Product
events and different actors remain separate. The badge says Recorded rather
than presenting the stored 204 convention as a successful customer action.
Group sizes count diagnostic rows, not discarded events or affected users.
The API uses an exact filtered count for pagination: a planned count of one
previously disabled Next despite a full page of actual records.

Do not close a customer incident solely because the admin view is readable or
the extension was published. Verify the client update and subsequent evidence.
