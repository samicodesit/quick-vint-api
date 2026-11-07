# Homepage recovery measurement

Status: owner explicitly approved early release on November 7 after reviewing the saved early experiment results. The November 9 wait is waived. Deployment acceptance and UTC release timestamp will be recorded separately.

## Primary decision

Judge recovery by new paying customers, with search and activation explaining where improvement happens. A CTA click increase alone is not success.

- Record production commit, verified deployment time in UTC and exact changed pages at release. Export final mobile-entry-v1 aggregates before their 30-day evidence retention expires. If released early, mark the prior experiment interrupted, not won.
- Freeze the immediately preceding 28 complete UTC days as the comparison baseline. Preserve the historical July/August/September Stripe dashboard series separately. Do not substitute partial July webhook history for the full July dashboard count.
- Primary report: distinct customers making their first successful positive subscription payment in each 28-day window. Verify sufficient Stripe history to exclude previous subscribers. Report reactivations, credit-pack buyers and new subscription MRR separately. Existing subscription_create invoice counts are subscription starts, not necessarily lifetime-first paying customers.
- Show both absolute counts and change, plus weekly counts for context. Compare equal periods, not incomplete calendar months or a four-day run rate. Historical 20 to 13 monthly dashboard subscribers is context, not a like-for-like 28-day target.

## Diagnostic funnel

1. Search Console: same eight homepage URLs, web search, complete 28-day windows. Show impressions, clicks, CTR and query-level position by language, country and device. Keep listing-agent and description-generator query families separate. Blogs are a contextual comparison, not a randomized control.
2. Homepage CTA events: distinguish hero, navigation and final placement. Existing analytics serializes data-track-copy-version into context.heroCopyVersion; hero and final web actions carry acquisition_recovery_v2. Do not treat event counts as unique visitors, install counts or payments. Navigation has separate source context and is not uniformly version-tagged.
3. New signup cohorts: first authenticated server-confirmed successful draft within seven days, followed by first positive payment within seven days. Compare equally mature signup cohorts, report numerators/denominators, and disclose unattributed/cross-device outcomes. Do not join Search Console aggregate clicks directly to individuals.

## Review windows and action

- Release acceptance: verify live titles, canonical/hreflang, rendered CTAs, correct app destination and app availability. Prior local app preview was feature-disabled, so a live homepage screenshot is insufficient acceptance of the app path. Use safe existing-account checks; no fake customers or test purchases.
- After seven complete days: check indexing/crawl observations, tracking and obvious funnel regressions. This is an early diagnostic, not a paid-recovery verdict.
- After 28 complete days: compare traffic and distinct first-time subscription buyers against the frozen baseline. Report the latest seven days' conversion cohorts as pending, then finalize their seven-day outcomes on day 35.
- Traffic improves but activation does not: investigate the app entry and first-draft path before further title changes. Activation improves but paid buyers do not: inspect paywall/checkout and intent by cohort. Search remains weak after confirmed recrawl: revisit page/query rankings and competitors using fresh evidence.
- Report recovery as observed improvement, not causal proof that a specific title or CTA alone produced it. The release bundles search copy and layout. No new split test or automatic spending is authorized by this plan.

No recurring automation has been created. Source baseline evidence is in the parent workspace reports/paying-decline-2026-11-07 and the local homepage recovery review.
