# Homepage mobile experiment evidence, 2026-10-12

## Scope and sources

This is a proposed homepage experiment, not a web-app product experiment. The design preview is local only. No assignment, experiment or homepage layout change has been published.

- Search Console, verified property autolister.app, Web search, September 13 to October 10. Homepage regex covers root plus fr, de, nl, pl, es, it and pt homepages. Device rows: mobile 646 clicks / 4,233 impressions, desktop 103 / 1,025, tablet 7 / 41. Independently filtered mobile and desktop charts confirm their respective click counts. Mobile is 85.4% of these device-row clicks. Clicks are not unique people or all-channel visits. The unfiltered chart total does not match the filtered row sum; no sitewide percentage is claimed.
- Mobile top queries: ai listing agent for vinted (231), vinted ai listing agent (106), ai vinted listing agent (56), ai listing agent vinted (36), autolister ai (31). Desktop has relatively more branded clicks (autolister ai 30, autolister 9). Generic mobile AI-listing intent is an inference, not a survey.
- Mobile countries: UK 393, Germany 46, Netherlands 38, Ireland 31, Italy 17, Spain 17. English preview is appropriate for the largest observed market; launch still needs all eight existing locales.
- Existing server click logs over a rolling 30 days: 476 Chrome Store click events, 338 classified phone/tablet and 138 desktop; 328 mobile clicks were hero placement. These are events, not installs, unique visitors or a conversion rate. Most Store events lack a unique browser/session identifier. The new app CTA had only six click events at the audit snapshot, so it has no mature baseline.
- At the pre-purchase snapshot, 41 active paid profiles: 23 had observed successful generation activity, all classified desktop; 18 had no classifiable activity in the window. This does not establish that all paying customers use desktop. Later that day the first observed iOS web-app subscription activated and generated useful drafts, confirming the mobile access route can produce paid value.
- Google Analytics landing-page report, September 14 to October 11: 23 sessions, only success/cancel/not-set rows, no homepage rows. This is missing measurement, not evidence of little traffic or no revenue. The actual Google SDK reproduces a broken array dataLayer queue; the canonical arguments queue restores page-view request generation. The regression intercepts every collection request, sends no analytics data and includes the old implementation as a negative control.
- Search Console Core Web Vitals: 49 good URLs for mobile and desktop, zero poor/needs-improvement URLs. This is property-wide field evidence, not a measured score for this proposed variant. PageSpeed API returned 429; no score or synthetic LCP is invented.

## Proposed test

One 50/50 test among eligible mobile homepage visitors, stable per-browser assignment. Desktop remains unchanged. Keep H1, compatibility/trademark copy, canonical/hreflang, counter, real icons and full demo asset.

- A: current demo-first hero, followed by app and extension actions.
- B: Create a draft plus no-install explanation first, full demo immediately after, then clearly labelled desktop Chrome extension alternative. Move the Orion setup link into support navigation to reduce competing phone paths in the hero.
- Common prerequisite: ensure lower-page How It Works and final CTA also offer the web app to phone visitors. Currently they only describe extension installation. Fix these equally in both arms before measurement so the test remains about hero ordering.
- Primary outcome: a first authenticated, server-confirmed successful draft within seven days per unique eligible exposed browser. CTA clicks and signups are diagnostics; paid outcomes are secondary at this volume. Store clicks are never counted as installs. Cross-device extension activation is unobservable without an attribution bridge and must be reported as such.
- Reuse existing bounded website telemetry and admin reporting. Before activation, verify unique exposure, stable assignment, attribution through app auth/generation and bot/internal-account exclusion. No new database or analytics service is needed. The Google tag repair alone does not implement experiment attribution.
- Capture a reliable exposure/activation baseline first. Roughly 23 mobile Google clicks per day supports one substantial experiment over weeks, not eight locale tests or daily winner declarations. Total all-channel unique exposure remains unknown.
- Illustrative power only: a 10% to 20% lift needs about 199 browsers per arm; 5% to 10% about 434, at two-sided 95% confidence/80% power. Neither baseline is measured. Choose a fixed sample/horizon from the corrected baseline, include at least two complete weeks and avoid repeated significance peeking. If inconclusive, retain control.

## Source guidance

- Google dataLayer setup: https://developers.google.com/tag-platform/tag-manager/datalayer
- Google website-testing SEO guidance: https://developers.google.com/search/docs/crawling-indexing/website-testing
- Vercel background work contract: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil

The existing copy and SEO identity are preserved. No mobile winner or conversion improvement is claimed before a valid measured experiment.
