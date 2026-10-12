# Homepage mobile experiment evidence, 2026-10-12

## Scope and sources

This is a homepage experiment, not a web-app product experiment. The user accepted the actual rendered A/B comparison and a 50/50 phone split. `bc27dba` is live on autolister.app, with Vercel deployment `dpl_7rCT87abgkrrFmBfrECJ7umBnhna` confirmed READY after the full 937-test guarded main push. Live playback and admin acceptance passed.

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

## Implemented measurement and QA

- `mobile-entry-v1` assigns one cryptographic bit before paint on the eight homepages, below 768px. Browser storage keeps the variant across refresh/auth/app entry. Denied storage defaults to A without claiming exposure. Enrollment ends November 2 UTC; outcomes finish November 9 and the UI returns to A. Thirty-day retention is unchanged, so final aggregates must be exported before cleanup.
- One durable exposure is queued per browser, with the existing browser/session IDs and two bounded assignment labels. Raw event occurrence time survives receipt delays. Server-classified crawlers are excluded. Identifiable internal browser evidence is excluded, but unidentified anonymous activity cannot be classified without adding fingerprinting. Exposure describes a recorded browser page load, not proof of attention or a unique person.
- Primary outcome is an authenticated API success or committed result within seven days on the same browser. Repeated generations/recovery do not inflate the browser conversion. Mature cohort rates use Wilson 95% intervals. Client success events, other-browser accounts, extension generations and outcomes outside the window are not counted. Stripe activations are a separate secondary metric, attributed only when exactly one eligible observed browser belongs to that verified account before payment.
- Existing `/admin/web-app` renders both arms and pending/mature cohorts at desktop and phone widths. It stays a manual bounded query, not realtime polling. The existing entry-click local commit is capped at 16ms, reduced from 150ms; removing it entirely lost clicks in a native browser test. Generation and billing never wait for analytics delivery.
- Native Chromium: 20 homepage checks, including the real first visible frame, 320/360/390px, all translations, unchanged desktop geometry, blocked storage, four autoplay/first-tap cases and delayed buffering with fullscreen consuming the gesture. The 21-check app regression confirms processed local photo inputs, exact generation-to-review CTA placement, long text, offline persistence, paywalls/checkout, response-loss recovery, batch and overlay dismissal. Six admin modal cycles and mobile A/B readability pass with zero page errors. No production telemetry, signup, purchase or generation is created by these fixtures. Physical iPhone Safari is not verified.
- The poster is an actual 40-second finished-listing frame from the existing demo, encoded at 1280x720 as a 31 KB WebP. No AI-made product proof or new video asset is introduced. The video starts synchronously on a user tap before fullscreen, and clicking native controls no longer forces fullscreen.
