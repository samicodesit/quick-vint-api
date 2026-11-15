# Conversion reliability implementation plan

Goal: address the demonstrated trial friction and misleading conversion reporting.
Architecture: preserve the existing manual retry and quality checker; check current generation allowance before new model creation; use live paid billing events to report purchasers separately from subscription state. Existing UI and quota policy remain the basis.
Spec: reports/conversion-audit-2026-11-15.md in the parent workspace.

Constraints: no new automatic provider calls, production writes, customer contact or changes to exemptions. No raw IP retention expansion. Execute inline, with endpoint regressions and the production gate. Visual verification must show the affected flow on desktop and mobile.

- [x] Accept incidental accessories and phone orientation; add a minor-difference verdict and simplify prompts. Preserve checks on material sale-item changes and obvious broken images.
- [x] Test model creation/retry rejects exhausted allowance before scheduling paid work while reads/dismissal stay available. Guard automatic model invitation and interactive setup using current usage.
- [x] Replace the operational growth scorecard's subscription-state conversion claim with separate first-time paid purchasers, credit-pack revenue and subscription starts using deduplicated live webhook events and prior payment history. Test duplicate events, currencies, renewals and missing history.
- [x] Run focused regressions, rendered flow verification and the full production gate. Review diff and prepare release evidence. Ask for production approval only after that evidence exists.

Review focus: paid credits with no free allowance; unknown capacity; account switches during async preflight; repeated webhook deliveries; never attribute a renewal or current subscription status as a new payment.

Production release and paid provider validation remain pending owner approval. Inline review: docs/qa/conversion-reliability/review.md.
