# Incident tracking consolidation

Approved scope: one durable extension transport and one website transport;
versioned ingestion with atomic deduplication; bounded, private incident evidence;
grouped Issues replacing Reports/Journey; independent Resend alerts and optional
budgeted Sentry; indexed expiry and a five-minute sweep. No PostHog or replay.

## Delivery order

1. Registry, sanitization, v2 endpoint contract and atomic database persistence.
2. Durable extension and website queues, account partitioning, critical flow stages.
3. Notifications, exception policy, quotas, cleanup and sweep.
4. Issues UI, integration/load/delivery verification and release documentation.

## Required limits

- Queue: 200 events, 512 KiB, 24 hours. Batch: 25 events, 48 KiB.
- Trace: 30 breadcrumbs, 8 KiB. Group: first and two recent examples.
- Evidence and groups: 24 hours; resolved evidence: one hour.
- Receipts/completed flows: 25 hours. Daily budgets: 48 hours.
- Server: 500 groups, 5,000 flows, 25,000 receipts, 20 MiB payload.
- Sentry: 100 attempts/day. Automatic mail: 20/day including overflow summary.

## Acceptance

Exercise delivery restarts, partial acknowledgements, offline and account changes;
concurrent ingestion and business side effects; correct flow stages and quiet
expected outcomes; identity/privacy; quota floods and cleanup; cursor pagination,
safe rendering and warm first-page latency under one second. Run frontend tests,
production build/package checks, backend production verification and admin tests.
Measure actual database/index size. Prepare branded synthetic alert preview and
verify actual inbox and permitted Sentry capture when the deployment exists.

## Release boundary

Prepare locally. Obtain approval before production migration, deployment or store
release. Database and compatible backend first, website next, extension last.
Provide a server-side processing switch. Do not claim Alan's original failure is
fixed by successful telemetry checks. Live Vinted checks remain separately opt-in.
