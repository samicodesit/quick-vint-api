# Monthly and One-time packs review

Date: 21 October 2026. Both repositories use the local feature branch `codex/monthly-one-time-packs`.

## Scope

The existing pricing cards, feature lists, free trial, subscription limits and badges remain intact. Monthly and One-time tabs separate subscription plans from listing-generation credits on the pricing page, web app and extension paywall. Existing Buy credits entries open One-time. The web app Upgrade entry opens the chooser.

Following screenshot review, the extension's daily and monthly limits sit beneath the plan name on the left. Total price and per-listing price remain on the right at desktop and mobile widths. The initial follow-up incorrectly retained mobile stacking; this was rejected by the user and corrected. Geometry checks now enforce left/right columns and limits beneath the plan name at 320px and 390px in all 18 billing-copy languages, on both billing tabs where applicable. The new regression failed against the stacked layout before the mobile override was removed. Independent visual review accepted the corrected desktop and mobile captures with no findings. Full frontend verification passed again after the correction.

| Option      | Price           | Listing allowance | Approximate price per listing |
| ----------- | --------------- | ----------------- | ----------------------------- |
| Starter     | EUR 3.99/month  | 75/month          | EUR 0.053                     |
| Pro         | EUR 9.99/month  | 250/month         | EUR 0.040                     |
| Business    | EUR 19.99/month | 600/month         | EUR 0.033                     |
| 20 credits  | EUR 5.99 once   | 20                | EUR 0.30                      |
| 50 credits  | EUR 9.99 once   | 50                | EUR 0.20                      |
| 100 credits | EUR 16.99 once  | 100               | EUR 0.17                      |

Unit prices are calculated from the displayed price and allowance, formatted for the locale. Monthly prices assume full monthly use. Packs are extra listing generations, without a subscription or credit expiry. Purchasing a pack does not alter subscription features.

## Stripe mapping

| Pack ID       | Product               | Price                            |
| ------------- | --------------------- | -------------------------------- |
| `credits_20`  | `prod_UhOCX2YtIWedAw` | `price_1ThzPhP5rNq9hGDSVZZSnLqQ` |
| `credits_50`  | `prod_VTvvLV7QLVAp0L` | `price_1USy3OP5rNq9hGDSeMkhzX64` |
| `credits_100` | `prod_VTvvYXr6RbBJMp` | `price_1USy40P5rNq9hGDS3O786Ald` |

The server resolves pack prices and quantities. An omitted pack ID remains 20 credits. Authenticated web-app billing uses the bearer user's profile. Fulfillment validates the catalog quantity and handles both immediate and delayed confirmed payments, using the existing unique Stripe session ID to prevent duplicate grants. The legacy pricing API field remains available beside the additive three-pack catalog.

## Verification

- API: lint, TypeScript and production build pass. Full tests pass, 885 passed and 3 opt-in tests skipped.
- Frontend: full `verify:production` passes, including 113 unit tests, 207 browser tests, 2 opt-in browser skips and the production build.
- API aggregate gate stops at formatting in three pre-existing, unrelated documents: `docs/growth-current-sprint.md`, `docs/oversized-image-generation-handoff.md`, and `docs/qa/draft-model-pilot-review-20261020.md`. Those files were left untouched by this change.
- Actual browser QA covers all eight localized pricing pages and all 18 billing-copy languages in the web app. It checks all six checkout selections, bearer ownership inputs, 320px and 390px widths, keyboard tabs, Escape and the Buy credits entry.
- Extension verification includes translated labels in 18 languages, unit prices, selected-pack checkout, narrow widths, preserved monthly options and scroll reset when reopening the paywall.
- Independent QA reviewed code and actual desktop/mobile screenshots. Findings repaired: additive pack discovery, delayed-payment audit coverage and retained paywall scroll. New regression checks exercise these cases.
- Final independent visual acceptance confirms complete headers and readable German and Greek layouts. Original unrelated changes in both repositories remain intact, verified against their saved baseline patches.
- UI review follows the compact-copy rule: no new marketing sections or redundant helper text. The two approved billing qualifiers explain real billing consequences.

Screenshots are actual local renders, using deterministic account and checkout fixtures. Final deliverables are `AutoLister-pricing-review.pdf` and `AutoLister-pricing-screenshots.zip`, uploaded to private review storage with seven-day signed links. Links and verification hashes are retained locally in `pricing-final/review-links.json`, outside the repositories.

No live purchase, opt-in Vinted flow, production deployment or extension store release was performed. The code is prepared locally for review; the unrelated API formatting gate remains a release limitation.
