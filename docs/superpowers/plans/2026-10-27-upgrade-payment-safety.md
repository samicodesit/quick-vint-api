# Upgrade payment safety

User instruction: implement safeguards, obtain an independent review of actual changes, do not deploy. Work inline using the existing Stripe, Supabase and Astro stack.

## Scope decision

The proposed prorated quota was reconsidered when the owner asked whether it fits AutoLister's size and revenue. The independent reviewer and root recommend keeping existing pricing and full tier allowances, with no mid-cycle usage reset. The observed customer has paid EUR12.24 and used 259 listings; no abuse has been established. Honour existing grants. Do not build a new billing page, fractional quota ledger, refund system or recurring cost monitor.

Keep this work separate from the prepared web Resume and translated free-limit copy changes in other worktrees. No deployment, production migration, customer mutation, external message or Stripe setting change.

## Implementation

- [x] Reproduce unpaid upgrade handling through webhook endpoint tests before changing product code. Active and past-due Stripe subscription states must not grant the unpaid higher tier or suspend a still-paid prior tier.
- [x] Preserve the previous paid tier, legacy flag, custom limits and usage while a plan-change invoice is unsettled. Continued access requires both the existing period end and verified paid usage period to be current. Failed renewals keep their normal overdue behavior. Do not unpause accounts through an unpaid upgrade.
- [x] Process a settled current-cycle prorated invoice as an entitlement update without a usage reset. Accept zero-due paid invoices. Ignore a stale invoice from another period or one superseded by a newer latest invoice.
- [x] Reuse current subscription ownership checks. Compare the captured tier, status, legacy flag, paid period and expiry marker when writing. Refresh Stripe after capturing the profile to reject stale payment snapshots. Conflicts return HTTP 409 for Stripe retry. Invoice-read failure must retry instead of granting benefits.
- [x] Expire preserved access at the verified paid boundary using the existing atomic reservation transaction. Protect the expiry field from customer writes. Clear it on verified payment, cancellation or return to free so purchased credits remain usable. Handle a settled base renewal followed by an unpaid upgrade without granting the unpaid tier.
- [x] Run a bounded, GET-only cost check once. Preserve aggregate output only. No automatic follow-up task.
- [x] Run the production verification gate, independent code review, and fix material findings.
- [x] Record final verification. Leave undeployed. Disposable cleanup was attempted but blocked by command policy; outputs remain.

## Cost evidence and limits

One-off script: scripts/inspect-upgrade-costs.ts. Aggregate evidence: parent workspace reports/growth-health-2026-10-26/upgrade-cost-check.json. Four successful reads, 642657 bytes, about three seconds; an initial invalid-column GET returned 400 before correction. No AI calls or customer writes.

At October 27, 00:49 Amsterdam, retained customer costs were USD3.655 for 259 requests and USD0.0903 for nine requests after the EUR2.25 upgrade. Full 600-request scenarios cost USD8.47 at the customer mean or USD11.97 at the overall mean. The additional 350 requests alone could cost USD4.94 at the customer mean. These are request-cost extrapolations, not guaranteed costs per completed listing or a maximum cost bound.

The October retained-request total is USD32.84 for 1646 priced calls, with 26 unknown costs. Model-null and unretained calls are not included. The existing estimator's total-token-only fallback uses input pricing, which may understate output costs. Stripe's earlier October 1-26 EUR334.45 net-volume snapshot has a different cutoff and is not profit. FX, tax, payment fees, hosting, other subscriptions, acquisition expenses and refunds require separate reconciliation. Do not claim full-use upgrades or the overall business are proven profitable.

## Review focus

Payment failures, delayed/replayed invoice and checkout events, legacy/custom access, paid-period expiry, ownership mismatches and simultaneous payment events. No product UI changes; the compact-copy rule remains satisfied. Review runtime work at billing-event frequency, not generation frequency.

## Final verification, October 27

Independent reviewer accepted the final concurrency repair with no remaining blocking findings and independently reran all 38 webhook tests. The final full `npm run verify:production` passed lint, TypeScript, build, formatting and 1138 tests. Thirteen existing opt-in browser tests were skipped. The native database tests cover expiry, authenticated write protection and recovery. No live payment was made. `git diff --check` passed.

The prepared migration `migrations/2026-10-27_upgrade_payment_expiry.sql` must precede application deployment. It has not been applied to production. Existing profile reads include one extra nullable field; generation adds no database round trip or AI call. Eligible billing events refresh Stripe and verify the invoice, with no new background job or service.

Removal of the disposable `dist`, `.astro` and temporary `node_modules` symlink was rejected by command policy before execution. They remain in this checkout. The source, regression tests, aggregate cost evidence and this record are retained. Nothing deployed or pushed; no customer allowance or billing settings changed.
