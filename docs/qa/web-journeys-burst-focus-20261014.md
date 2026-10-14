# Web journey, burst policy and focus audit, 2026-10-14

## Production observations

Read-only admin journeys and individual API/event log-detail records were checked for October 14, Amsterdam time. No customer account, allowance or subscription was changed. No live generation, purchase or marketplace operation was triggered.

- The requested account uploaded one photo, reopened the app several times and voluntarily viewed plans. No generation attempt, checkout or recorded technical error was found. Repeated auth-complete events carry `method: session`, indicating existing-session restoration rather than repeated sign-in failures. All five trial generations remain available. Logs cannot establish why the user stopped before generating.
- Six identified signed-in accounts produced eight successful web generations and one blocked batch item. Normal quota paywalls followed an exhausted five-use trial on another account. Useful copy events were present. No checkout attempt was recorded for this cohort in the checked window.
- A five-item batch completed four items, then hit `burst_limit`. The failed API detail is `05d6a6b0-d41b-4013-bb31-9c4204a24b1e`, status 429, `generationCommitted: false`. The affected account's current trial/monthly counters both show four, matching its four successful generations. Direct credit-ledger inspection was unavailable, so no ledger-level claim is made.
- Its 76 rapid photo-import events describe local draft imports, not 76 server upload requests. Successful generation details contain prepared photo counts of 4, 6, 10 and 5; the blocked attempt contains 6. No image-source change is part of this fix.
- Six anonymous email-link failures used reserved example.com addresses; the provider explicitly rejected those invalid destinations. These records do not establish an outage for real customer addresses.
- Anonymous app-view records include a duplicate pair for one session. Count distinct browser/session IDs rather than raw views for this small cohort. App reloads, absent copy events and gaps do not establish confusion. Local navigation, manual writing and every settings interaction are not fully observable.

## Fix and policy

Both extension and web app use the same backend tier configuration and atomic reservation policy. Free and Starter burst ceilings become 20 requests/minute, allowing the largest supported batch without artificial sleeps. Pro remains 20 and Business 30. Daily/monthly allowances, trial uses, charge/refund decisions, bans and entitlement checks remain unchanged.

The prior Free reservation burst allowance depended on remaining trial plus pack credits. It could shrink during a batch, or become excessive for a large credit wallet. Request pacing now uses the stable tier ceiling independently of wallet balance. No scheduler delay, new dependency, migration or infrastructure is introduced.

Paywalls initially focus their heading; profile sheets initially focus their dialog panel. Pointer/programmatic focus does not show the Safari blue ring, while keyboard navigation retains visible focus and trapping. Modality changes write one HTML attribute only when the modality changes; no timer or polling is added.

## Verification

- Negative controls reproduced the old policy failure using real PostgreSQL production reservation, credit ledger and shared retry SQL. A frozen transaction clock prevents a minute boundary from accidentally hiding throttling. Old trial batches failed at item four and legacy Starter at item eleven.
- Eleven actual SQL regressions pass: both clients' full trials, paid-credit batches, exact twenty-credit depletion, Starter daily/monthly limits, legacy Starter allowance, retained Pro/Business ceilings, and an explicit restrictive-cap negative control. The targeted policy/usage suite passes 66 tests in four files.
- An actual Chromium regression initially failed because the paywall focused X. The permanent browser suite now passes 24 flows, including initial heading/panel focus, profile Tab/Shift+Tab trapping, pointer return without an outline, keyboard return with an outline, and existing batch/paywall/editor/local draft flows.
- Physical iOS Safari is not tested by Chromium. Production release acceptance is recorded after deployment. Browser fixture tests intercept authentication, generation and billing rather than charging real users.
