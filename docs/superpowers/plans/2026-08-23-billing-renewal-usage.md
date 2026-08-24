# Billing Renewal Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset monthly usage exactly once per paid monthly Stripe period and handle failed-renewal grace safely.

**Architecture:** Parse the recurring non-proration service period from Stripe invoices and pass it to one row-locking PostgreSQL RPC. Webhooks and reconciliation share that path; delinquent subscriptions preserve usage but cannot generate until payment succeeds.

**Tech Stack:** TypeScript, Stripe Node SDK, Supabase/PostgreSQL, Vitest, Vercel cron.

**Spec:** `docs/superpowers/specs/2026-08-23-billing-renewal-usage-design.md`

## Global Constraints

- All customer subscriptions are monthly.
- Never reset usage on a failed invoice, refund, or same-period proration.
- Never change free-lifetime usage, pack credits, daily counters, or manual overrides in the monthly reset RPC.
- Database migration must be applied before application deployment.
- No new dependency.

---

### Task 1: Define paid-invoice period parsing and grace entitlement

**Files:**

- Create: `src/utils/subscriptionInvoice.ts`
- Create: `src/utils/__tests__/subscriptionInvoice.test.ts`
- Modify: `src/utils/subscriptionStatus.ts`
- Modify: `src/utils/__tests__/subscriptionStatus.test.ts`
- Modify: `utils/rateLimiter.ts`
- Modify: `src/utils/__tests__/rateLimiter.entitlements.test.ts`

**Interfaces:**

- Produces: `getInvoiceSubscriptionId(invoice): string | null`
- Produces: `getPaidSubscriptionPeriod(invoice): { start: string; end: string } | null`
- Changes: `hasPaidEntitlementStatus("past_due")` returns `true`; `unpaid` remains `false`.

- [ ] **Step 1: Write failing tests**

  Add literal fixtures proving a recurring non-proration line returns its subscription ID and ISO period, a proration-only invoice returns `null`, `past_due` receives paid entitlement, and `unpaid` custom limits resolve to free capacity.

- [ ] **Step 2: Verify RED**

  Run: `npm test -- src/utils/__tests__/subscriptionInvoice.test.ts src/utils/__tests__/subscriptionStatus.test.ts src/utils/__tests__/rateLimiter.entitlements.test.ts`

  Expected: failures because the invoice helpers and grace behavior do not exist.

- [ ] **Step 3: Implement minimally**

  Parse `invoice.parent.subscription_details.subscription` with the legacy `invoice.subscription` fallback. Select only a non-proration subscription line and convert its numeric `period.start`/`period.end` to ISO strings. Add `past_due` to paid entitlement statuses and require an effective paid Business tier before custom limits apply.

- [ ] **Step 4: Verify GREEN**

  Run the command from Step 2 and expect all selected tests to pass.

### Task 2: Add the atomic paid-period reset

**Files:**

- Create: `migrations/2026-08-23_paid_invoice_usage_periods.sql`
- Modify: `src/utils/subscriptionUsageReset.ts`
- Modify: `src/utils/__tests__/subscriptionUsageReset.test.ts`

**Interfaces:**

- Produces database RPC: `reset_monthly_usage_for_paid_invoice(p_user_id uuid, p_stripe_subscription_id text, p_stripe_invoice_id text, p_period_end timestamptz) -> jsonb`
- Changes: `buildSubscriptionProfileUpdate` never resets monthly usage from a status transition.

- [ ] **Step 1: Write failing helper tests**

  Prove free-to-paid, new-subscription, upgrade, and `past_due`-to-`active` profile updates contain no `api_calls_this_month` or `last_api_call_reset` fields.

- [ ] **Step 2: Verify RED**

  Run: `npm test -- src/utils/__tests__/subscriptionUsageReset.test.ts`

  Expected: existing activation cases still reset and fail the new assertions.

- [ ] **Step 3: Implement the helper and migration**

  Remove status-driven resets. Add `last_usage_period_end` and `last_usage_reset_invoice_id`, backfill paid profiles from `current_period_end`, and create a security-definer RPC that locks the profile row, rejects blank input/subscription mismatch/equal-or-older periods, then sets only `api_calls_this_month = 0`, `last_api_call_reset = now()`, and the two markers.

- [ ] **Step 4: Verify GREEN**

  Run the command from Step 2 and expect all tests to pass.

### Task 3: Route webhooks and reconciliation through the RPC

**Files:**

- Modify: `api/stripe/webhook.ts`
- Modify: `src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts`
- Modify: `api/cron/billing-reconciliation.ts`
- Create: `src/api/__tests__/billingReconciliationUsageReset.test.ts`
- Create: `migrations/2026-08-23_paid_entitlement_reservation.sql`

**Interfaces:**

- Consumes: invoice helpers from Task 1.
- Consumes: `reset_monthly_usage_for_paid_invoice` from Task 2.
- Produces: webhook support for `invoice.paid` and `invoice.payment_succeeded`.
- Produces: reconciliation response fields `usageResets` and `usageResetErrors`.

- [ ] **Step 1: Write failing endpoint tests**

  Prove checkout activation and subscription updates never reset, invoice failure never calls the RPC, a paid recurring invoice calls it with literal IDs/period end, and reconciliation submits the newest paid period.

- [ ] **Step 2: Verify RED**

  Run: `npm test -- src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts src/api/__tests__/billingReconciliationUsageReset.test.ts`

  Expected: failures because paid invoices are audit-only and reconciliation has no usage repair path.

- [ ] **Step 3: Implement minimally**

  Add paid invoice switch cases, resolve the profile by Stripe customer ID with email fallback, reject stale subscription identities, sync without a reset, then call the RPC. In reconciliation, pick the newest paid subscription invoice matching the stored subscription and call the same RPC; use Stripe's live status to distinguish a recovered payment from one still past due. Re-create the reservation RPC so stored custom limits require paid entitlement and only `service_role` can execute it.

- [ ] **Step 4: Verify GREEN**

  Run the command from Step 2 and expect all endpoint tests to pass.

### Task 4: Restrict the rolling reset to legacy rollback and verify production readiness

**Files:**

- Modify: `api/cron/reset-counts.ts`
- Modify: `vercel.json`
- Create: `src/api/__tests__/resetCountsLegacy.test.ts`

**Interfaces:**

- Preserves: `/api/cron/reset-counts` only for free profiles in legacy pricing mode.

- [ ] **Step 1: Restrict the compatibility route**

  Keep the endpoint and schedule, return immediately in current mode, and reset only profiles without paid entitlement when legacy mode is enabled.

- [ ] **Step 2: Run focused tests**

  Run: `npm test -- src/utils/__tests__/subscriptionInvoice.test.ts src/utils/__tests__/subscriptionStatus.test.ts src/utils/__tests__/subscriptionUsageReset.test.ts src/utils/__tests__/rateLimiter.entitlements.test.ts src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts src/api/__tests__/billingReconciliationUsageReset.test.ts`

  Expected: all selected tests pass.

- [ ] **Step 3: Run the full gate**

  Run: `npm run verify:production`

  Expected: lint, type-check, build, formatting, and all tests pass.

- [ ] **Step 4: Review the diff and rollout order**

  Confirm the diff touches only the listed billing files, the migration is additive/idempotent, and deployment notes require migration first. Do not deploy or mutate production data without an explicit production rollout request.
