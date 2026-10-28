# Billing disclosure and evidence improvements

Purpose: make future subscription and refund disputes answerable from contemporaneous records. No promised win rate, retrospective consent, customer outreach or live deployment.

## Design

Use Stripe's existing hosted checkout and portal. Add one explicit recurring-terms acceptance and concise cancellation/refund information. Preserve signed Stripe facts in the existing private billing ledger. Archive the exact welcome email before sending and reuse that payload on retries. Keep statutory withdrawal separate from stopping future renewals. Reuse existing report history and support tooling rather than build a CRM.

## Execution

- [x] Verify official card-network, Stripe API and consumer requirements with independent reviewer.
- [x] Test and implement checkout disclosures and durable signed-event evidence.
- [x] Test and implement exact confirmation snapshots and retry consistency.
- [x] Make cancellation and withdrawal paths accessible, record requests and acknowledgments.
- [x] Add scoped evidence export and operating/release checklist.
- [x] Run targeted tests, migration tests, full production gate and desktop/mobile visual/link checks.
- [x] Independent implementation review and fixes.
- [x] Prepare concrete release result and unresolved provider/configuration prerequisites in `docs/billing-evidence-release.md`.
- [ ] Verify hosted checkout and provider settings, resolve seller/account setup, approve automated transactional email exception and production release.

## Boundaries

Isolated worktree: `billing-dispute-evidence`, branch `codex/billing-dispute-evidence`, base `b03c097`. Existing backend and frontend changes are untouched. Native worktree creation refused the nested repository path, so a local Git worktree was used. No live purchases, Vinted sessions, customer sends or dispute submission.
