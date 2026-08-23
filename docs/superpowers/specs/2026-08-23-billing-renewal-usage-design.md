# Billing Renewal Usage Design

## Goal

Tie monthly usage resets to paid Stripe subscription periods instead of an unrelated rolling 30-day cron, while preserving customer access during payment retries and preventing duplicate or stale Stripe events from resetting usage twice.

## Approved behavior

- A paid invoice for a newer monthly subscription period resets `api_calls_this_month` exactly once.
- Initial paid activation also resets through its paid invoice, not checkout or subscription status events.
- A prorated plan change inside the current period preserves usage.
- A plan change that starts a genuinely newer paid period resets once.
- `invoice.payment_failed` never resets usage.
- `past_due` keeps the paid tier and remaining allowance during Stripe's retry grace period.
- `unpaid` and `canceled` remove paid entitlements without changing usage, free-lifetime usage, credit packs, or manual grants.
- A later successful retry resets the newly paid period once and returns the subscription to Stripe's current status.
- Refunds do not alter usage periods.
- All subscriptions are monthly; annual-period policy is out of scope.

## Architecture

Stripe invoice service-period end is the monotonic period key. A migration backfills each paid profile's current Stripe period end from the existing `current_period_end`, then adds a security-definer RPC that locks the same `profiles` row used by generation reservations. The RPC rejects subscription mismatches and ignores equal or older periods before atomically resetting the monthly counter.

The webhook handles both `invoice.paid` and the already-configured `invoice.payment_succeeded` event. Both routes call the same RPC, so receiving both events is harmless. The daily billing reconciliation applies the latest paid subscription invoice through that RPC, healing missed webhook delivery without creating a second reset.

The rolling `/api/cron/reset-counts` route remains only as rollback support for `PRICING_LIMITS_MODE=legacy`. It is a no-op in current mode and resets only profiles without paid entitlement. Paid subscriptions always use Stripe invoice periods.

Custom grants remain stored when a profile loses paid entitlement, but both TypeScript and the authoritative reservation RPC ignore them until paid entitlement returns. Direct client access to the security-definer reservation RPC is revoked. This keeps legacy rollback safe without deleting manual grant data.

## Data flow

1. Stripe sends a paid invoice event.
2. The handler ignores non-subscription invoices and invoices without a recurring, non-proration subscription line.
3. The handler retrieves the subscription, resolves its customer profile, and syncs tier/status/current period without resetting usage. A different subscription ID is adopted only after Stripe confirms the stored subscription is no longer live.
4. The handler calls `reset_monthly_usage_for_paid_invoice` with profile ID, subscription ID, invoice ID, and the invoice line's service-period end.
5. PostgreSQL locks the profile row, validates that the invoice belongs to its current subscription, and resets only when the period end is newer than `last_usage_period_end`.
6. Stripe retries or reconciliation can repeat the operation safely.

## Failure handling

- Missing profile or malformed subscription invoice: fail the webhook so Stripe retries; reconciliation supplies a second recovery path.
- Duplicate or stale invoice: return a no-op result and acknowledge the webhook.
- Subscription mismatch: keep a live stored subscription; adopt a replacement only after Stripe confirms the stored one is inactive.
- Database error: return HTTP 500 and emit the existing critical endpoint alert.
- Failed invoice: audit only; status changes arrive through `customer.subscription.updated`.

## Rollout safety

1. Apply both additive database migrations first. The reservation migration restricts custom limits and RPC access; the usage-period backfill prevents the first mid-cycle proration after rollout from looking like a new period.
2. Verify the live Stripe webhook endpoint sends `invoice.payment_succeeded`; `invoice.paid` is additionally supported.
3. Deploy the application change; the independent reset cron becomes a current-mode no-op and remains available only for legacy rollback.
4. Run reconciliation and inspect its reset/error counts plus billing audit rows.
5. Do not claw back any allowance already granted by the old cron.

## Verification

- Pure tests cover modern and legacy Stripe invoice shapes and reject proration-only invoices.
- Status tests prove `past_due` retains paid entitlement while `unpaid` does not.
- Endpoint tests prove checkout, upgrades, failed invoices, paid renewals, and recovered payments call or avoid the reset RPC correctly.
- Rate-limiter tests prove expired-payment customers cannot retain custom paid limits.
- Reconciliation tests prove a missed paid invoice reaches the same idempotent RPC, matches the stored subscription, and repairs a recovered `past_due` profile only when Stripe is live again.
- The complete `npm run verify:production` gate must pass before integration.
