# Sign-in estimates panel, November 17, 2026

Status: local draft, not deployed. Owner replaced the item/draft example with estimated time saved, views, favourites and time to sell. The explicit Verify code work remains part of this release.

## Display and assumptions

- Main benefit: 4 minutes of estimated writing time saved per listing. The arithmetic is displayed as 5 minutes by hand versus 1 minute with AutoLister. These are illustrative process assumptions, not measured average completion times.
- Supporting scenario: 40–60 views and 3–5 favourites in the first 7 days; 7–14 days to sell. These are owner-authorized illustrative estimates, not measured AutoLister customer averages, marketplace-wide averages or evidence of a causal uplift.
- The panel visibly says “Illustrative estimates per listing.” It uses ranges and states the engagement window. No testimonial, customer count, measurement source or statistical significance is invented.
- Desktop pairs a large time-saving figure and three supporting metrics with sign-in. Mobile keeps sign-in first and the numbers below. The code step keeps its compact mobile layout, with the estimates hidden while entering the code.
- Preserve the existing palette, fonts and compact controls. No helper filler, animated counters, invented charts, repeated cards, model invitation or additional setup step.

## Research

[List Perfectly](https://listperfectly.com/) leads with a quantified listing-speed benefit. [Reclaim](https://reclaim.ai/) groups large values with short unit/context labels. These inform hierarchy and presentation only. Their numerical claims were not transferred to AutoLister.

[Vinted's own guidance](https://www.vinted.co.uk/help/57-selling-your-items-faster) describes photos, descriptions, pricing/promotions and seller activity as factors in selling. It does not substantiate our illustrative scenario values. The panel and this record keep estimates distinct from measured customer outcomes.

## Validation

- The updated browser test failed on the prior build because the four requested metric blocks were absent, then passed on the new build.
- All 18 interface languages at 320, 390, 768 and 1440px pass: no horizontal overflow; sign-in remains before estimates on phones/tablets; actions fit the initial viewport; translated metric labels and estimate note are present. The code screen also passes these 72 combinations.
- The built-app end-to-end journey passes explicit verification by click/Enter, real spaced-code clipboard paste, leading zero, simulated autofill, validation, network retry and duplicate-submit protection, followed by uploading/generating and restoring drafts and settings.
- Full production verification passed: lint, type checking, build, formatting and 1,804 tests, including the enabled first-use and legacy browser suites. Five unrelated opt-in tests were skipped. Existing public landing pages, indexability, canonical URLs and sitemap configuration are unchanged. All browser network responses are fixtures; no real email, payment, generation-provider call or production deployment.

Screenshots retain the previous example layout, the final desktop/mobile numbers placement, and the final code field in context. These are actual local rendered screens.
