# Sentry capture sampling

The total capture ceiling remains 100 per UTC day. The compatible backend passes
the server-assigned incident ID to the atomic database reservation. The database
looks up the stored severity. A client-provided severity is never used.

Transient incidents receive at most three representative captures per incident
per UTC day, and at most twenty transient captures in total. Blocking incidents,
warnings and automatic server exceptions retain the remaining shared capacity.
The total ceiling still applies to those failures. Every accepted occurrence and
its normal evidence remain in Issues; this policy only controls Sentry forwarding.
It does not change customer reports, notifications, uploads, auth or generation.

Apply `2026-10-12_sentry_capture_sampling.sql` before deploying the compatible
backend. It adds two small fields to the existing expiring daily-budget rows and
an overload of the existing service-role-only reservation function. Existing
no-argument callers continue to work during deployment or rollback. No existing
record, counter or function is removed or reset. An already exhausted budget
remains exhausted until the next UTC day.

Rollback by reverting the backend change. Leave the additive database fields and
overload installed; the old backend uses the original function. No destructive
database rollback is required.

Verification includes native PostgreSQL reproduction of the original starvation,
three runs of concurrent reservations, aggregate/global ceilings, migration
reapplication and old-function compatibility, plus SQL-engine and SDK-routing
regressions and the full backend production gate.
