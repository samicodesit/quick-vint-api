# Incident tracking release

Status: backend and website deployed on 3 October 2026. Production is on
`aa2128daa73db553126f576c1a2e12a46315969d`. The additive migration was applied
to AutoLister's `jqloiovdwjaornnfvmyu` project before deployment. Extension store
submission remains a separate release step.
Phone reporting no longer depends on owner registration. Missing registration and
legacy sessions are accepted as unverified. Later reads of a trusted v2 session
repair attribution in background, including earlier saved receipts and operations.
The original evidence and immutable email snapshots retain their original identity
labels. Conflicting owners cannot replace a registration. Repeated reads coalesce
in flight and successful registrations are cached for one minute (200-entry cap).
The controlled rollout sent one synthetic internal alert. No generation,
customer creation or live Vinted operation was performed. Alan's reported
forced-refresh failure remains an unresolved diagnosis.

Performance follow-up corrected two blocking diagnostic waits. Popup sign-in now
starts tracking without awaiting it. Phone-session creation registers diagnostic
ownership through the existing serverless background continuation, after the
required product session is stored. Early phone evidence is durably accepted
without waiting for enrichment. Explicit
support reports still await durable acceptance. Regression tests hold telemetry
unresolved and verify sign-in and phone opening can complete; an actual popup
browser test also verifies code entry and sign-in success. The earlier controlled
1,004.2 ms tracking measurement is retained as pre-fix evidence in
`docs/qa/incident-tracking/performance-local.json`, not as current product latency.

## Changes

The extension background worker owns its persistent `chrome.storage.local` queue.
The website, phone uploader and callbacks share an IndexedDB transport. Existing
tracking call sites use thin wrappers. Both transports retain unacknowledged
events, partition them by their original account and enforce the same limits.
Failures flush immediately; routine events batch. Retry delays are 1, 5, 15 and
30 minutes, with `Retry-After` respected. MV3 alarms and startup/activity recovery
allow a terminated worker to resume delivery. Storage failure remains fail-open.

`/api/events/track` accepts the existing payload and response contract alongside
schema version 2, which returns acknowledged IDs, duplicates, explicit rejections
and report references. SQL receipts and incident changes commit atomically before
acknowledgement. Required business log writes participate in that transaction;
accepted duplicates cannot repeat attribution/style-learning side effects.
Telemetry never retries a generation or changes billing/product retry behavior.

`utils/incidents/registry.json` classifies events explicitly. Shared runtime assets
are generated with `node scripts/sync-telemetry-assets.mjs`; do not independently
edit the website copies of the shared core, client or registry. Flow evidence
separates generation received, fields applied and confirmed remote photos. A
five-minute machine-stage watchdog records **possibly stalled**, not a proven
crash. Waiting, cancellation, expected expiry and limits remain quiet. Reload and
worker interruption evidence is not labelled a Vinted crash. Visible photo-form
errors are observed only during AutoLister photo confirmation. Unknown host state
remains unknown.

Reports now renders Issues, and the old Journey entry opens recent user incidents.
The default view is open/acknowledged issues from the last 24 hours, with 50-row
cursor pages and lazy details. State changes are explicit. A successful generation
does not resolve an issue. Account/log links and notification/monitoring health
remain accessible.

Resend alerts use the existing branded layout, immutable persisted email snapshots
and idempotency keys. Blocking failures notify immediately; transient failures
need three distinct attempts within ten minutes. Recurrence after resolution
reopens an issue, with a one-hour notification cooldown. Pre-login automatic
failures can alert, but their identity is unverified. Anonymous explicit reports
remain quiet. Sentry is optional and separately capped; its SDK captures use the
same sanitization and daily reservation policy. Alerts work without Sentry.

## Bounds and privacy

| Record or transport          | Limit                                          |
| ---------------------------- | ---------------------------------------------- |
| Local queue                  | 200 events, 512 KiB, 24 hours                  |
| Request batch                | 25 events, 48 KiB                              |
| Failure evidence             | 30 breadcrumbs, 8 KiB after sanitization       |
| Incident examples            | First and two recent                           |
| Evidence                     | 24 hours; resolved evidence one hour           |
| Group summary                | 24 hours after last occurrence                 |
| Receipts and completed flows | 25 hours                                       |
| Daily budgets                | 48 hours                                       |
| Server rows                  | 500 groups, 5,000 flows, 25,000 receipts       |
| Diagnostic JSON payload      | 20 MiB centrally enforced                      |
| Sentry                       | 100 attempts per UTC day across instances      |
| Automatic email              | 20 per UTC day, including one overflow summary |

Identity comes from authentication or a registered hashed phone-session owner.
Legacy correlations remain unverified. Allowlists and redaction remove tokens,
raw session links, images, full HTML and generated descriptions from diagnostic
evidence and Sentry. Existing business retention and the separate style-learning
input remain under their existing policies. Disposable incidents do not add a
permanent diagnostic stream to `api_logs`.

The hourly cleanup deletes expired diagnostic rows in bounded batches. Issues
shows cleanup backlog, suppression, delivery failures and sweep health. Resolved
and expired evidence is removed first; repeated examples are reduced before first
evidence. Physical PostgreSQL allocation includes indexes and reusable space and
is not the same as the logical JSON limit. Deletes do not immediately shrink
physical files; normal PostgreSQL vacuum/reuse still applies.

## Local verification

- Frontend: the final complete local suite passed all 66 unit tests and all 177
  browser cases, with one explicitly opt-in incident reproduction skipped. The
  earlier restart-fixture race was corrected and the case also passed five
  consecutive targeted runs. No live Vinted traffic was used.
- Frontend `npm run build:prod` passed. The isolated packaging check verified all
  five helpers and loaded the packaged MV3 worker offline. The validation ZIP is
  `quick-vint/dist/autolister-incident-validation-v1.4.6.zip`; it does not change
  release status and is not a version-bumped store release.
- Backend tests passed, including real SQL via PGlite, identity/phone ownership,
  partial acknowledgement, privacy, quota/expiry, notification retry, Sentry
  budgeting, IndexedDB restart and admin behavior. See the implementation ledger
  for the final count.
- The clean release checkout passed the full production gate, including lint,
  type checking, formatting, build (130 pages), and all 487 tests. It excluded
  unrelated working-tree changes. Both production pushes used
  `npm run push:production` and moved `origin/main`.
- Real multi-connection PostgreSQL load results are preserved in
  [incident-postgres-acceptance.json](incident-postgres-acceptance.json). Thirty-two
  concurrent copies produced one accepted event, 31 duplicates, one occurrence
  and one email reservation. A 510-group flood stayed at 500 groups and 20 email
  reservations including overflow. Of 120 concurrent Sentry reservations, 100
  were accepted. All 500 groups paginated without gaps; bounded cleanup drained
  the expired fixture to zero backlog.
- At configured row caps, representative high-entropy diagnostic data occupied
  about 10.2 MiB of logical JSON and 19.4 MiB including tables/indexes on the first
  fixture; repeating it before vacuum increased allocated space to 28.0 MiB.
  These are physical allocation measurements, not a 20 MiB physical size promise.
  Warm first
  page SQL was below 20 ms in the local fixture. This is not a measurement of
  deployed HTTP/UI latency or the production database's existing allocation.
- Admin browser QA covers lazy detail loading, pagination, explicit state,
  account/log navigation and hostile evidence rendering. Exact alert HTML was
  rendered at desktop/mobile widths and its sole anchor verified against the
  real `/admin/reports?incident=...` route. No alert was sent.

## Coordinated rollout procedure

1. Inspect the live schema and take the normal migration recovery precautions.
   Apply `migrations/2026-10-03_incident_tracking.sql` first. It adds diagnostic
   tables/RPCs, indexes and service-role-only access. Existing legacy clients stay
   compatible. Do not deploy the new collector against a missing migration.
2. Deploy the compatible backend and website from `quick-vint-api`. They share
   this deployment, so their server/static assets must be coordinated. Check the
   existing Supabase service role, Resend, `CRON_SECRET` and optional Sentry DSN
   target AutoLister (`sss-h2/node`), not Cryptik. No paid service is introduced.
3. Verify the authenticated five-minute `/api/cron/incident-sweep` and existing
   hourly cleanup, including health timestamps and bounded notification retries.
   Inspect legacy 204-after-write and v2 ACK behavior in the deployed environment.
4. From an authenticated admin session, POST
   `/api/admin?action=issue-self-test`. This creates only a synthetic diagnostic
   incident. Confirm receipt at `samicodesit@gmail.com`, the returned incident
   link/detail, and Sentry when its budget permits. Inspect the exact final HTML
   and link before the approved send. This actual inbox/Sentry check is pending;
   local mocks and preview QA do not establish delivery.
5. Measure warm deployed first-page latency against the representative fixture
   or a suitable staging environment. The target is below one second. Do not
   load-test production customer records without a separate agreed procedure.
6. Prepare the next extension release version through the normal release flow,
   rerun packaging consistency checks and obtain store-release approval. Release
   the extension last. The new `alarms` permission is intentional. Retain the
   compatible backend while older installed versions continue sending v1.

Set `INCIDENT_PROCESSING_PAUSED=true` server-side to pause ingestion, alert work,
Sentry attempts and the sweep without blocking listing or paid-generation work.
The collector returns retryable 503 and new clients retain pending events up to
their 24-hour queue limit. Cleanup continues. The switch pauses the unified
collector, including its business event ingestion; use it as a temporary emergency
measure, not a normal operating mode. Issues remains readable and shows the pause.

Rollback should preserve the additive schema and durable pending evidence.
Reverting to an older backend leaves v2 clients without v2 acknowledgements, so
they retain/retry rather than silently discard events. Prefer the pause switch
while correcting the compatible backend. Do not drop diagnostic tables as a
routine rollback. Extension updates cannot be assumed to reach every user at once.

## Production verification, 3 October 2026

- Vercel reported both release deployments READY for production. Database RLS
  is enabled on all four diagnostic tables; anonymous ingestion RPC execution
  is denied and service-role execution is allowed.
- Scheduled sweeps ran without manual invocation. An unauthenticated sweep
  request returned 401. Bounded diagnostic cleanup reported zero backlog.
- A disposable expected-outcome event received a v2 acknowledgement, its retry
  received a duplicate acknowledgement, and a legacy request returned 204.
- The live Issues API took 496 ms initially and 440 ms on the next request with
  an empty inbox; a later check took 829 ms. This is not a production measurement
  at configured row caps.
- Synthetic incident `fbbfd012-d9ea-4b1a-a2ac-b6a10af55f9a` reached the real
  Gmail inbox at 14:24:10 UTC through Resend
  (`01a10226-a63d-7693-92ad-2cf7606aea3d`). Its link opened the correct live detail
  with the original exception stack. Sentry recorded it as NODE-5 in `sss-h2/node`.
  The two occurrences are preparation plus the actual authenticated self-test;
  they generated one notification.
- Acknowledge, resolve and reopen actions returned 200. The synthetic issue was
  finally resolved. At 14:30 UTC the scheduled sweep had run again, with one
  email and one Sentry reservation, zero pending/failed notifications, and zero
  cleanup backlog. Test-only records will expire under the normal retention.
- Desktop/mobile inspection exposed overflow from long diagnostic values.
  The wrapping fix is deployed and its revised preview had no horizontal
  overflow. The test email itself used the earlier renderer: the attempted
  pre-freeze returned no snapshot because freezing requires a claimed sending
  notification. No duplicate correction email was sent. The delivered HTML and
  real inbox receipt were read back rather than inferred from Resend acceptance.

The extension package/store step remains pending. Scheduled hourly cleanup has
not yet been observed after deployment, although its diagnostic RPC and local
endpoint tests passed. No telemetry test establishes that Alan's original
forced-refresh error is fixed. Further live Vinted reproduction is separately
opt-in, at human pace, through the established runner.
