# Checkout tracking repair, 27 October 2026

Status: prepared locally, not deployed. No migration has been applied to production.

## Confirmed gaps and scope

- The existing checkout start/opened events from extension and pricing were accepted by incident ingestion but omitted from historical API logs. Failures also lacked the same reporting retention. Keep these existing events, their original occurrence time and transport ID, using the existing atomic deduplication path.
- The server context filter dropped pack ID, checkout type and limit code. Preserve these bounded fields when clients supply them.
- Routine cleanup removed checkout evidence outside the mobile start/return exceptions. A follow-up migration preserves compact checkout and portal facts for the existing 30 days. Private payloads still clear and the function remains service-role only. No new table or scheduled work.
- Web checkout recorded start only. Its existing billing helpers now record start plus validated API handoff or failure, correlated per attempt. Analytics never delays payment requests. Manage billing uses portal events; reports exclude older identifiable management clicks too.
- Paid install welcome only used optional Google Analytics. Add canonical checkout events through the existing durable website transport after sign-in. The extension popup now records checkout failures as its paywall already did.

Existing pricing-page correlation, telemetry retries, Stripe payment webhooks, payment safeguards, Resume and translated paywall copy are reused. No price, allowance, checkout request body, payment destination or UI change. The extension patch is separate from the already submitted 1.4.26 package and requires a later extension release.

## Evidence and limits

Regression tests first reproduced dropped endpoint records/context, duplicate-retry persistence loss, cleanup loss, portal overcount, missing web handoffs/failures, missing welcome events and missing popup failures. Tests cover the real event endpoint and PostgreSQL ingestion/cleanup, plus web billing helpers, welcome flow, pricing flow and popup browser behaviour.

Validation completed: `npm run verify:production` passed lint, type checking, build, formatting and 1,157 tests (13 existing opt-in skips). The extension popup billing browser suite passed all 15 tests. Both repositories pass `git diff --check`. No production purchase, API mutation, migration, deployment or store submission was performed. The full extension release gate remains required when the popup patch is actually released.

An opened event means the API returned a valid handoff, not that Stripe rendered or a payment succeeded. Paid outcomes continue to require existing Stripe evidence. Old missing events cannot be recreated. Anonymous welcome/site activity and older clients can lack account or exact-attempt linkage; do not claim a complete historical or per-session abandonment census. Compare distinct accounts where verified identity exists and keep starts, handoffs, failures and confirmed payments separate.

Cost: retain a compact log row for existing checkout events within the existing ingestion transaction. Web and welcome add outcome events, and the popup adds an event on failure. No new database reads, tracking service, background job or AI calls are introduced. Existing cleanup handles the bounded 30-day records.

Release order if approved: apply `2026-10-27_checkout_funnel_metrics.sql`, then deploy the backend/web changes through the normal gate. Prepare the small popup correction in the next extension release. Do not replace or resubmit the pending 1.4.26 package.
