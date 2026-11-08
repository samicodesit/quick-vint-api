# AutoLister AI Growth Current Sprint

## Signed-in web app checkout, November 9, 2026

- Choosing a monthly plan or one-time pack in the web app opens the existing Stripe checkout for that choice. The Monthly and One-time tabs still switch the options displayed.
- Browser fixtures checked the six paid choices in 18 locales, keyboard activation, and phone layouts at 320px and 390px. Desktop and phone handoff checks reached the intercepted Stripe destination for each choice. The local draft suite passed 26 checks, including double taps, checkout errors, and keeping saved drafts through canceled and successful returns. The visual comparisons use the actual local app with fixture accounts.

## Free extension CTA wording, November 7, 2026

- Owner authorized choosing clearer free-start messaging and pushing. Extension entry now says "Add to Chrome for free" consistently in the header/menu, hero and final action, with natural equivalents in all eight locales. Supporting text says only "Create drafts directly on Vinted." The five-draft quota is removed from this pitch; the actual five lifetime generations and pricing disclosure remain unchanged. Web entry still explicitly offers a free draft.
- Rationale: retain the concrete install action and put zero upfront cost at the decision point. Grammarly's current browser page similarly includes free in its acquisition CTA (https://www.grammarly.com/browser). This supports the design choice, not a measured conversion advantage. No keyword-bearing introduction, title, heading or SEO metadata was edited.
- QA: 40 fresh-load locale/viewport checks at 320, 390, 1024, 1280 and 1440px. No overflow, clipped action labels or navigation overlap. German and English desktop placements inspected; all header labels remain on one line at 1280px. Eight Nu HTML validations return zero messages. Existing route/copy tests and the full production gate are required before push. Evidence is in the current visualization folder, homepage-recovery/free-cta-final. No signup, extension installation, generation or payment performed.

## Visible search wording and fractional rating, November 7, 2026

- Owner requested the important query wording in visible copy and a fractional star display. English desktop/mobile introductions now say "AI listing agent for Vinted" while retaining titles, descriptions, hashtags, seller notes and single/multiple items. The other seven locales use natural listing-generator wording consistent with their existing localized titles. No extra copy block was added. Title, H1, meta description, canonical and hreflang remain unchanged.
- Evidence: saved Search Console export for October 8-November 4 records 57 clicks for "ai listing agent for vinted" and 33 for "vinted ai listing agent". The previous release retained the English page title but lacked the phrase in visible body copy. This closes that content gap; it does not establish a ranking or paid conversion change.
- Replaced the single rating symbol with four gold SVG stars and a fifth filled to 60%, followed by the explicit 4.6/5 Store rating (localized decimal commas). Decorative stars are hidden from accessibility APIs; the numeric rating and Store source remain the link name. Existing 44px focusable link, device routing, CTA sizing and header counter remain intact.
- QA: 32 fresh-load checks across eight locales at 320, 390, 1024 and 1440px. No overflow or clipped actions/rating; one primary hero action at least 52px high. Maximum phone primary-button bottom is 475px in a 568px viewport. English desktop/mobile and long French desktop renders inspected. Nu HTML validation: eight pages, zero messages. Full production gate required before push. No new signup, install, generation or payment performed. Evidence: current visualization folder, homepage-recovery/keyword-final.

## Homepage entry and rating refinement, November 7, 2026

- Owner approved implementation and push after four actual-page directions and two independent agent reviews. Final desktop render was reviewed again with no blocking finding. Compared actual Grammarly browser and LanguageTool landing pages for clear primary/secondary entry hierarchy, not conversion benchmarks.
- Desktop Chrome-style browsers at >=1024px now prioritize the extension; phones, tablets, excluded browsers and no-JavaScript use the free web draft. Header/menu, hero, instructions and final action follow the same route. A quiet no-install alternative remains on the extension path. Removed the duplicate menu action, Orion hero link and companion testimonial from the decision block. Eight localized copy sets reviewed, including informal Portuguese. SEO title, description, H1, canonical and hreflang fingerprints are unchanged in all eight locales.
- Owner supplied a current Chrome Web Store screenshot showing 4.6 from nine ratings and 597 users. Added a compact gold-star 4.6/5 Store-linked line beside the extension action; localized decimal commas, no additional user badge and no aggregateRating schema. Rating has a distinct home_rating UTM context and no install-click event. Existing header counter remains unchanged at explicit owner request. Internal metric caveat: public-stats counts admitted API reservations, not a verified successful-output count; do not duplicate it as additional proof.
- Browser QA: 63 fresh-load checks across nine variants and seven widths, one visible primary CTA, >=52px height, no overflow/clipping or nav overlap, correct route and scoped rating. A script-free built-page fixture shows only the web primary. Keyboard traversal from install skips the hidden web branch and reaches its rating link. Initial rapid resize sampling captured delayed media-query events; final acceptance uses fresh viewport loads, with resize behavior separately unit-tested.
- Nu HTML Checker: nine variants, zero errors/warnings. Build and targeted compatibility/copy/performance/routing tests pass before the full production gate. No new signup, generation, installation or payment was performed. Evidence is in the current visualization folder under homepage-recovery/entry-final. Sources: https://www.grammarly.com/browser and https://languagetool.org/ .

## Desktop hero spacing refinement, November 7, 2026

- Owner requested refinement and production push after inspecting the live screenshot. Narrowed the desktop hero container from 1440px to 1200px, set a 48px column gap, and increased top padding from 97px to 128px. The headline and demo remain top-aligned. The 81px navigation now has 47px clearance before hero content instead of 16px. CSS applies only at 1024px and above; copy, metadata, destinations and mobile ordering are unchanged.
- Browser geometry QA: all nine variants at 320x568, 390x844, 768x1024, 1024x768, 1280x800, 1440x900 and 1920x1080, 63 passes. No horizontal overflow, nav overlap, clipped CTA labels or mismatched headline/demo top edges. All primary CTAs at least 52px high; maximum CTA bottom on 320px phones is 467.74px. Desktop column gap is 48px throughout. Build and 17 targeted country-routing/experiment tests pass before the mandatory full production push gate.
- Visual acceptance: English desktop composition and long German headline inspected at full screenshot resolution. This is direct layout QA, not a new independent expert review or evidence of conversion lift. Evidence is in the current visualization folder under `homepage-recovery/spacing`, including geometry JSON and before/after captures. Treat this as a same-day refinement of the recovery release, excluded from the November 8 start of the comparison window.

## Homepage recovery release acceptance, November 7, 2026

- Owner approved release before the old experiment's November 9 end. Frozen early-close snapshot: 25/275 mature activations for demo-first and 36/294 for CTA-first; one attributed payment each. Directional activation evidence, not an established winner or paid lift. Post-release accumulation in the old report is not an uncontaminated final result.
- Released commit `65d7f220bed674ad7bef4a4983f74185667af992` through `npm run push:production`, `main -> main`. Vercel `dpl_2mVpdjXp7TMwxjMg2Tneu8pRE8Mq` READY at 2026-11-07 15:20:12 UTC and verified on autolister.app. Full gate passed: lint, type-check, build, formatting, 1688 tests, 22 opt-in skips.
- All eight live homepage variants passed title/H1/canonical/hreflang and CTA destination checks. Live desktop/mobile rendered checks passed; hero click opens the working app and existing drafts. No signup, generation or purchase was performed. Actual before/after previews are saved in the visualization folder's `homepage-recovery/live-release` directory.
- Evidence: parent workspace `reports/paying-decline-2026-11-07/release-acceptance.md`, `release-status.json`, `live-homepages.json`, and `measurement-windows.json`. Compare October 10-November 6 against November 8-December 5 UTC; exclude release day. Primary outcome is first-time positive subscription-paying customers; clicks, signups and successful drafts explain the funnel. No recurring monitoring was scheduled.

## Homepage model photo back view, November 7, 2026

- The owner asked for a clear back view because the second front view was too similar to the first. The homepage now pairs the existing v2 front photo with a generated rear illustration. The image prompt used the v2 front as the model, outfit and room reference and the older AI rear example for the pose and plain rear surface. The source set has no original rear photo.
- The WebP is 576 by 864 pixels and 45,282 bytes. The rear caption and alt text are localized for all eight homepages. The production-mode build passed, eight homepage tests passed and 24 localized browser checks passed at 320, 390 and 1440 px. Compared the new image with the front in the actual rendered section.
- The corrected preview is a local draft. The November 6 version went live as commit `e122b2a` and is the before view in the preview. The new screenshot and browser evidence are under `model-photo-refresh/rear-correction/` in the task visualization directory.

## V2 model-photo website examples, November 6, 2026

- Local draft only. Refreshed the model-photo section, hero thumbnail and gallery in all eight homepage locales, plus the feature page and how-to guide in English, Dutch, French and German. The new gallery card sits alongside the original seller comparison. Feature pages and guides retain that comparison in a separate seller section. Existing layout, pricing and experiment assignment are unchanged.
- Generated one fictional v2 model and two top photos using the current product compiler, classifier, image generation and checker, without prompt/model overrides. The source is the existing public beige embroidered top and its detail photos. Both generated views passed automated checks and visual review. There is no rear source, so the second photo is labelled as another AI photo. Provider token-cost estimate: USD 0.12976425 against a USD 1 ceiling. No customer model, private customer photo, marketplace action or production storage write.
- The owner's girlfriend's before/after comparisons, five case-study assets and four story sources remain byte-identical to the starting commit. Thirteen preserved files are hashed in `docs/qa/model-photo-refresh-20261106/provenance.json`. Historical sales figures are kept separate from the new example.
- Desktop and mobile browser QA: 60 pages across 1440, 390 and 320 px, plus eight existing variant-B homepage checks. No horizontal overflow, missing images or browser exceptions. New and historical gallery zooms and local app/pricing/story destinations passed. These are browser emulations. Signup, first-value generation through a customer account, live marketplace uploads and conversion outcomes were not retested for this content-only refresh.
- The production gate passed lint, types, enabled-content build, formatting and 1,685 tests, with 22 existing opt-in skips. Final placement review includes actual rendered homepage, gallery, hero teaser, feature page and guide captures. No filler helper text or sales guarantee was added. Source updates and social metadata use the same current example.
- Evidence: parent workspace `reports/model-photo-refresh-20261106/`; rendered before/after and localized QA sheets in `C:/Users/Sami/.codex/visualizations/2026/11/06/01a1b308-10ab-78a1-8bb5-0ae62b6cf2ac/model-photo-refresh/`. Production publication requires owner approval of the finished result. No push, deployment, outreach or advertising spend occurred.

## Homepage model feature, November 1, 2026

Hero follow-up, still local: added a compact link with a real model-photo thumbnail, amber New badge and static violet glow. It replaces the generic desktop hero badge and appears under the introductory copy on phones, before the demo in both variants. The existing hero routes and A/B assignment remain unchanged. The thumbnail is 2,226 bytes; clicking or keyboard-activating the link jumps to the full example with clearance below the fixed navigation. Full-section CTAs still follow the shared phone/tablet check. Above-fold placement is checked at actual viewport dimensions, not inferred from scrolled screenshots; see `hero-audit.json` and the `hero-*` before/after captures in the existing evidence directory.

Local draft, not deployed. Added one shared model-photo section below the demo/gallery in all eight homepage locales and both existing `mobile-entry-v1` variants. Replaced the generic third AI feature card, retaining the two concrete listing/organizing features. Existing hero heading and listing explanation, experiment assignment, enrollment dates, SEO metadata and pricing remain unchanged.

Final hero verification: 64 combinations of eight locales, A/B assignment and phone/laptop viewports pass above-fold visibility and keyboard fragment navigation. The homepage now respects reduced-motion preferences for scrolling to the example. The final production gate passes 1,357 tests with 14 opt-in skips, plus lint, types, build and formatting. Live-to-built HTML comparison confirms unchanged title, H1, description, robots, canonical, hreflang, Open Graph metadata, structured data and all existing links across eight homepages. All 111 sitemap URLs match production. These checks do not predict rankings or conversion. Final evidence: `hero-audit.json`, `hero-production-gate-final.log` and `seo-check.json` in the parent report directory.

Uses the actual staged embroidered-top input and generated pair, clearly labelled original/AI front/AI back. Existing source evidence: parent workspace `reports/model-rollout-20261101/staging-paid-result.json` and `reports/draft-model-audit-2026-10-12/public-01/01.jpg`. These illustrate one result, not guaranteed fidelity or measured conversion. A brief review instruction explains the necessary check. The soft violet glow and amber New badge are static; no animation, font or third-party dependency was added. Three lazy WebP images total 78,974 bytes, with dimensions reserved.

The CTA follows device type, not A/B assignment. Extracted the existing native-photo-picker phone/tablet predicate without changing it. Phones and tablets, including desktop-mode iPads, get the web app; computers get the extension, including narrow desktop windows. Existing click telemetry records `home_model_feature` and retains experiment attribution. No new experiment or tracking endpoint. The section is identical in both variants apart from the device-dependent action.

Thirty headless Chromium checks cover all eight locales, both variants, 320px phones, phone landscape, Android, simulated iPad desktop mode, narrow desktop and laptop/desktop widths. Checked image loading, one visible CTA, destinations, keyboard focus, reduced motion, overflow and console errors. These are browser emulations, not physical-device verification. Real local desktop and mobile before/after captures are in the task visualization directory's `home-model-feature` folder. Review found no filler beyond necessary feature explanation and AI-result review guidance. Following the owner's explicit request, an independent reviewer inspected source, all new assets and actual desktop/mobile A/B screenshots, accepting code and visuals with no material findings. Physical devices and ranking/conversion outcomes remain unverified.

Production push is authorized after acceptance, but remains held for extension availability. Store status workflow `41349938483` confirmed at 2026-11-01 21:03 UTC that 1.4.29 is public and 1.4.30 is pending review. The desktop model-feature CTA would otherwise promote functionality absent from the current public extension. No production push or deployment has occurred for these homepage changes.

Evidence: parent workspace `reports/home-model-feature-20261101/`, including the browser audit, asset provenance, captures and production gate. No additional paid image generation, production write, customer contact or deployment. Before deployment, confirm extension 1.4.30 is available because the desktop CTA leads to its store page. Record the eventual deployment timestamp when analyzing the ongoing homepage experiment: a shared page change still separates pre-change and post-change cohorts. New enrollment is currently scheduled to end November 2; measurement ends November 9. Neither date was changed.

## Private ChatGPT plugin submission preparation, October 31, 2026

Prepared a local listing and minimal support/privacy/terms additions. No homepage,
pricing or canonical URL changes. All new copy rendered at desktop and 390px
mobile widths; no horizontal document overflow. The listing uses existing brand
art, accurate browser-scoped notes and no promised marketplace publishing.

Fixed stale-account and disposed-receiver import paths. Production gate: 1,215
passed, 14 opt-in skipped; lint, types, build and formatting passed. Independent
reviewer: 22/22 receiver/storage tests passed, no further actionable packet issues.
Local browser imports and account-change rejection passed at both widths, with
zero generation calls. Authentication and transfer data were fixtures. Isolated
cap tests passed, but PGlite does not establish multi-session PostgreSQL races.

Public launch stays blocked on verified publisher identity, supported canonical
Sites App publication/authentication, reviewer access and real ChatGPT review
cases/demo. No upload, deployment, invitation, send or spend. Details:
[submission preparation](plugin-submission/README.md). Evidence in parent workspace
`reports/ai-visibility-2026-10-28/comparison-v2/plugin-public-independent-review-2026-10-31.json`
and `plugin-public-gate.log`. Final rendered before/after sheets are in the task
visualization directory's `plugin-public-preparation` folder.

## Vinted ChatGPT guide comparison, October 31, 2026

Checked the three listing drafts against the original outputs for the Damart top. Desktop and mobile previews passed placement, disclosure and overflow checks. The title, canonical URL, structured data and existing comparison table match the prior page. This single example does not measure recommendation changes.

## Homepage video and pricing strip, October 29, 2026

- Local draft only. Removed the entire homepage plan/comparison strip and its unused script/styles at the owner's request. Pricing navigation and the pricing page remain available. No new helper copy.
- The demo now uses a versioned H.264 MP4: 3,612,085 bytes versus 4,383,684 bytes (17.6% smaller). Preserved 1920x1080, 60 fps, all 3,551 video frames and 59.211-second container duration. Copied AAC audio without re-encoding; compressed audio hashes match. Original asset retained. Independent review caught a higher decoder level in the first candidate; final encoding explicitly constrains High profile level 4.2, reference frames and VBV instead of relabeling the bitstream.
- Final full-video SSIM is 0.996513. Inspected original-pixel text/QR crops at 20 and 45 seconds with no obvious additional blur. This remains a lossy encode, not a pixel-identical claim. Earlier larger candidates were rejected.
- Chrome played both complete videos without media errors and sought to 20 seconds. The comparison recorded 22 dropped frames for the original and 23 for the optimized video during concurrent playback. Local byte-range response is 206. Homepage loads the optimized source; desktop and 390px mobile show no horizontal overflow or pricing strip. Fullscreen entry was not confirmed by browser automation; real iOS/Safari and production network performance remain untested.
- Full production gate passed: 148 test files, 1,198 tests, 13 opt-in skips, lint, types, build and formatting. Updated the existing deferred-video regression assertion for the new asset URL. SEO fingerprints match across all 134 generated pages and 112 sitemap entries. No ranking or field performance guarantee.
- Evidence: parent workspace `reports/ai-visibility-2026-10-28/video-optimization`; desktop/mobile screenshots and review video in the task visualization directory. No deployment, push or external message.

Release follow-up: user explicitly waived physical iPhone testing on October 29. Safari native API branches, cold source assignment, denied-fullscreen playback retention and idle-loading fallback pass a simulation of the actual homepage script. This is not actual iOS playback proof. Chrome fullscreen rejection was traced to background automation: a foreground native click succeeded, emitted `fullscreenchange` for VIDEO and exited successfully. No fullscreen product patch was needed. User requested no further foreground computer control; remaining verification stays in the background. Final release acceptance is recorded after review and deployment below.

October 30 final preparation: full production gate passes 1,201 tests in 148 files with 13 opt-in skips on current production base bc92451. Final compatible file played completely in the hidden in-app Chromium browser, paused/resumed and sought correctly. Portrait 390x844 and landscape 844x390 layouts have no horizontal overflow; video plays without media errors. These are responsive Chromium and simulated Safari API checks, not an iOS engine or physical-device test. SEO fingerprints remain identical across 134 pages and 112 sitemap entries. Final independent sign-off and production acceptance follow separately.

Independent release reviewer accepted the scoped release on October 30 with no blocking findings after separately checking codec/frame metadata, audio hashes, fullscreen and sharpness evidence, complete playback results, Safari API simulation and final gate results. Physical iPhone testing remains explicitly waived. Owner authorized deployment after this acceptance.

## Homepage gallery performance follow-up, October 29, 2026

- Removed the visible gallery title at the owner's request. Kept the compact card sizing and accessible controls.
- Added AVIF previews with WebP fallback and 480/800/960px candidates. Full-size images load only on enlargement. Four standard-density preview files now total 52 KB versus 171 KB in the first gallery build. The gallery script is 539 bytes gzip, with no external carousel dependency.
- Reserved control-row space before scripts run and cached slide geometry on resize. Measured load CLS fell from small gallery startup shifts to zero in the optimized local runs. Mobile loading fetched 42 KB of gallery imagery versus 138 KB before. These are local measurements, not field Core Web Vitals or a claim of overall page speed improvement.
- Full production gate passed again: 1,198 tests, 13 opt-in skips, lint, types, build and formatting. SEO fingerprints unchanged. Desktop/mobile appearance, navigation and full-size image loading checked. No deployment or external contact.
- The existing 4.4 MB autoplay demo is the largest measured first-party download and remains a follow-up target. Local LCP samples were mixed; real-device lab and real-user INP/LCP/CLS remain unverified. Evidence and limitations: parent workspace `reports/ai-visibility-2026-10-28/gallery-performance/review.txt`. No new independent reviewer was dispatched under the current routing rule.

## Homepage promo gallery prepared, October 29, 2026

- Owner approved placing the four reviewed promo designs in the existing homepage section, with scrolling and desktop/mobile previews. Local only, no push or deployment. This supersedes the two small homepage previews described below.
- Added a native horizontal scroll gallery with snap positions, previous/next buttons, position counter, localized accessible labels and the existing full-size preview. Following owner feedback on hierarchy, desktop cards are capped at 440px wide (275px high), with 92% width retained on phones. The video remains the primary visual. No autoplay or duplicate captions. Modal keyboard focus now stays inside the preview and returns to its trigger on close.
- Used the four owner-reviewed graphics: listing drafts, QR photo transfer, batch drafts and saved notes. Responsive WebP copies total 171 KB at 800px and 410 KB at 1600px. Images remain lazy loaded. Artwork is English on all locales, as were the source product captures. These are AI-enhanced marketing illustrations based on product captures/source, including historical controls and a demo QR, not new live-workflow evidence.
- Full `npm run verify:production` passed: lint, types, build, formatting, 148 test files and 1,198 tests; 13 opt-in tests remain skipped. Installed the worktree's frozen dependencies after the initially reused dependency directory lacked cropperjs. No dependency manifest or lockfile change.
- Browser checks: all four images load and enlarge, arrows reach both ends and disable at the bounds, Escape closes, reverse Tab stays in the modal. Inspected actual desktop and 390px mobile placement, plus 320px and 768px sizing with no document overflow; controls remain 44px square. No browser console errors. Physical-device swipe testing, live marketplace flows and conversion outcomes were not tested.
- All 134 page SEO fingerprints and 112 sitemap locations match the pre-gallery baseline. Existing headings, canonical URLs, descriptions and hreflang remain unchanged. Source and QA evidence are in the parent `reports/ai-visibility-2026-10-28` directory. Final desktop/mobile before-and-after captures are in the task visualization directory. Inline review checked readable promotional headlines, factual copy and no redundant helper text; no new independent review was dispatched under the current task routing rule.

## QR visual and screenshot claim cleanup prepared, October 28, 2026

- Replaced both homepage promotional preview references with the existing organizer screenshot and a new QR modal example. This removes the old images' unverified safety, speed and superiority claims from the homepage previews. Historical asset URLs remain available; no redirects or image deletions were introduced.
- Added a compact, collapsed phone-to-computer explanation and QR example to all eight photo-guide locales and support. The first step follows the actual extension route: Phone | Computer, then one item. Phone-only web app and Orion choices remain distinct.
- QR pixels were captured from committed extension UI source `27a3cece07df927b0dcf2aae6c04a1e21322e74a`, with the original visible modal template and styles. The example uses `example.invalid`, no active session, and fixed English preferences. Caption and alt text identify it as an example. It is interface evidence, not a physical-phone recording or successful live-transfer demonstration. Existing unrelated extension changes were untouched.
- Fresh independent reviewer accepted the final scope after correcting the entry-button instructions in eight locales. Desktop and 390px mobile previews, all eight expanded guide locales, support and switching between screenshot previews were checked. Full production verification passed 1,198 tests with 13 opt-in skips, plus lint, types, build and formatting. Final copy correction was rebuilt. All 134 SEO fingerprints and 112 sitemap locations are identical before/after.
- No send, push, deployment, live marketplace action or paid generation occurred. Ready for owner review as a site-content change. Actual phone/Orion and QR-transfer recordings remain pending; no benchmark result is claimed. Evidence and the independent review are under `/home/mests/projects/autolister/reports/ai-visibility-2026-10-28/`, including `qr-static-qa.json`, `qr-production-gate.log`, `qr-release-independent-review.txt` and `qr-preview/provenance.json`.

## Source corrections and demonstration preparation, October 28, 2026

- Prepared three unsent factual outreach drafts for WeartyAI, Fripio and ChromeBoard, with current public business contacts, exact branded HTML and Resend payloads. Owner requested review before sending. No outreach, publication, spend or deployment occurred.
- A fresh independent reviewer checked baseline interpretation, source facts, French copy, comparison fairness and SEO risk. Incorporated five lifetime free generations, daily alongside monthly limits, optional ChromeBoard companion-app context and a common three-photo benchmark input. Final draft review accepted; no measured superiority is claimed.
- Three recording scripts cover phone web-app drafting, Orion in-form use and multi-item preparation. Comparison copy is sourced and openly vendor-authored. Actual physical-device recordings, a verified real-item dataset and benchmark results are pending; live Vinted recording remains separately opt-in. Existing simulated QA screenshots cannot serve as real performance proof.
- All three final email previews were visually inspected at 390px and 1280px, with no horizontal overflow. Descriptive body anchors and full destinations were checked. The inherited support helper initially left Markdown links unrendered; local previews preserve the branded wrapper and explicitly render anchors and plain preheaders. Any later approved send must use the exact reviewed payload, not regenerate through that helper. This task did not change the production email helper.
- Private evidence: `/home/mests/projects/autolister/reports/ai-visibility-2026-10-28/demo-comparison-preparation.txt`, `outreach-drafts.json`, `outreach-browser-qa.json`, `outreach-preview-hashes.json` and `source-demo-independent-review.txt`. Public source files and SEO metadata are unchanged. Later media additions should enrich existing guides after evidence review, not create overlapping ranking pages.
- Owner's standing preference: obtain fresh independent review for important or bias-prone growth claims, comparisons and release acceptance. Retain the distinction between a reviewer's judgment and underlying measured evidence.

## Phone information production release, October 28, 2026

- Owner authorized deployment and live verification. Commit `9cfabe4` was pushed to `main` through `npm run push:production`; the full gate passed with 1,198 tests and 13 opt-in skips. Production's newer paywall change was preserved. Vercel automatic deployment was triggered.
- The broad live-link audit also found inherited Spanish, Italian, Polish and Portuguese navigation links to nonexistent blog routes. The shared navigation now uses the existing blog locale/path helper, which falls back to the English blog for unsupported languages. Existing localized blog routes remain unchanged. This is a link-only correction with no new URLs or SEO metadata edits.
- Final deployment and live verification evidence will be recorded in `/home/mests/projects/autolister/reports/ai-visibility-2026-10-28/live-release.txt` and `live-verification.json`. No signup, generation, checkout or marketplace publishing is part of this content release check.

## Comparison claims and rating correction, October 28, 2026

- Owner-approved follow-up to the independent review, in the same `codex/phone-product-information` worktree. No deployment or push. This entry supersedes the earlier decision to retain the global rating.
- Limited product edits to the existing ChatGPT comparison page and shared application schema. Scoped the table to the browser extension versus manual ChatGPT chat, corrected photo and free-plan capabilities, linked OpenAI's source and removed unmeasured timings, speed multipliers and unsupported superiority/perfection language from the body. Corrected the extension signup instruction. Existing title, H1, URL and core topic are retained.
- Removed the unverified 4.3/six-rating aggregate from the global layout. Kept both application identities and the free-install offer. Replaced Chrome as an operating system with explicit Chrome/Orion software requirements. The website no longer supplies that unsupported score for star rich results; current production star appearance was not established.
- One deliberate SEO text exception: the comparison page meta description and Article description now identify both web app and browser extension. Across 134 built HTML pages, all titles, H1s, canonical/hreflang links and robots tags remain unchanged. All 112 sitemap locations are unchanged. `seo-after-claims.json` differs from the original fingerprint only at that single meta description.
- Validation completed after the corrections: lint, TypeScript, Astro build, format check and all 1,198 tests pass (148 suites, two workers). Thirteen opt-in browser tests remain skipped. The new rating guard failed against the old build and passes on the corrected build; all 24 rendered-guide checks pass. Reviewed the comparison at 1280px desktop and 390px phone widths. No page-level horizontal overflow; the existing table container supports its small internal overflow on phone. No authenticated product, billing or marketplace actions were run.
- Sources checked October 28: [OpenAI image inputs](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq) and [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies). Evidence is in `/home/mests/projects/autolister/reports/ai-visibility-2026-10-28/`, including `seo-after-claims.json` and the updated QA ledger. The local comparison preview remains available for owner review.

## Phone product information prepared, October 28, 2026

- Prepared on `codex/phone-product-information` from production commit `742e93a` in `/home/mests/projects/autolister/.worktrees/phone-product-information`. No push or deployment. The original development checkout and homepage experiment are unchanged.
- Corrected the 24 listing guides across EN, FR, DE, NL, PL, ES, IT and PT. Added phone-only FAQ information, two clearly named entry choices and an explicit Orion setup link. The web app requires copying text into the marketplace; the extension fills the marketplace fields directly, including on iPhone/iPad through Orion. Retained the desktop upload instructions and identified their screenshot as the desktop organizer.
- Owner review changed the photo guide's defensive six-checkbox block into a three-step workflow covering both product paths. The dedicated checklist and copyable templates remain functional. The existing `#checklist` anchor is preserved.
- Added web-app help to support and the older comparison/Orion guides. Added a separate WebApplication entity on pages that explain it, including existing homepage and selected blog entry pages. The extension has its own stable entity ID; its existing offer/rating data is retained, never assigned to the web app. No new URLs, redirects, crawler changes or duplicate landing pages.
- Before/after production-source builds: all 134 HTML route fingerprints are identical for title, H1, meta description, robots, canonical and language alternate links. All 112 sitemap locations are identical. The app/auth noindex behavior is preserved. This reduces avoidable technical SEO changes; it does not guarantee unchanged rankings.
- Validation: lint, TypeScript, Astro build, format check and all 1,198 tests pass (148 suites). Thirteen opt-in browser tests remain skipped. The first default-concurrency gate hit three 10-second database setup timeouts; those 16 tests passed on targeted rerun, and the complete suite passed with `--maxWorkers=2` without changing test timeouts or application code. An intermediate new DOM assertion matched the selector inside a script; it now checks the actual section tag and passes against the final build.
- Visual review: final English desktop and English/French phone layouts, mobile support and desktop Orion guide inspected. All eight photo-guide locales have fitting action labels, correct destinations and no horizontal overflow at a 390px viewport. The live `/app` link reached the existing signed-in draft workspace. No new account, generation, purchase, extension installation or marketplace publishing was performed. This is content/navigation QA, not a fresh end-to-end verification of signup, payment or Orion functionality.
- Evidence: `/home/mests/projects/autolister/reports/ai-visibility-2026-10-28/seo-before.json`, `seo-after.json`, `seo-fingerprint.py`, `phone-choices-final.jpg`, and `phone-information-qa.txt`. The screenshot is the final revised card after owner feedback.
- After an approved release: request recrawling for the key changed URLs, monitor page/query/device Search Console results and repeat the same neutral AI prompts. Feature newness may contribute to lag, but our pilot directly observed incorrect product descriptions citing our older content. Do not promise a recrawl time or AI recommendation position.

## Acquisition reporting repair, October 26, 2026

- Repaired bounded acquisition reads in an isolated branch: stable pagination, successful generation POST filters, compact fields, 100-account report batches and explicit query/row caps. Existing user-list batching is preserved. No schema, background task, model call or new tracking service.
- Read-only local execution of baseline and repaired handlers against the same production window changed attributed activation from 10 to 95 (Google 9 to 81), with 111 new attributed signups unchanged. Fixed run: five database GETs, 312,930 response bytes, 1,967ms, not truncated. These are generation and client-claim metrics; current paid entitlement is still not a payment conversion count.
- Independent reviewer checked correctness and cost bounds. Targeted endpoint, helper and user-list tests pass. The full gate exposed a dated event-test fixture; reused the already-present fix from the active main checkout without changing product behavior. Release remains subject to final gate and owner deployment approval. [Evidence and scope](qa/acquisition-report-repair-2026-10-26.md).
- Final gate passed: lint, type-check, build, format and 1,115 tests; 13 opt-in browser tests skipped. Independent reviewer accepted final changes. Ready for owner-approved deployment; not pushed to production.

## Stronger style CTA, October 19, 2026

- Owner found the original static halo too faint. Use this style now has a stronger blue halo, a deeper blue fill and a light sweep that repeats every 4.2 seconds. The label stays above the decorative layer and the button does not move. Reduced-motion mode removes the sweep while retaining the stronger halo. The light overlay is capped at 20 percent so white text retains at least 4.6:1 calculated contrast across the fill.
- Actual browser captures at the start and middle of the sweep differ visibly; this checks rendered pixels as well as animation state. Short previews still fit their content, long descriptions and notes scroll, the settings remain stationary, and the fixed bar retains a 12-pixel gap. The 48-case responsive browser regression passes, including moving/disabled animation modes. Measurements wait for font and resize-observer layout completion. No new helper text, homepage, experiment, auth or preference change is included. Final production verification follows.
- Full-suite load exposed a stale 435-pixel available-height measurement at 700 by 600 when the actual available height was 451 pixels. The preview container can move without resizing the header/footer. The observer now also tracks its parent container; a controlled 16-pixel parent-layout change reproduces the stale spacing and verifies recovery. The corrected build passes all 1,032 tests, including nine actual browser cases and the motion/layout checks. The earlier failed release gate did not push the shimmer change.

## Preview content height, October 19, 2026

- Owner requested that the phone preview card end at its content, with unused vertical space between the card and the bottom settings. Scoped the change to the existing single-column entry layout: the card aligns at the top and fits its content up to the available row height. Longer content keeps its internal scroll area. Settings, fixed CTA, shadow and 12-pixel bar separation retain their positions. No UI copy, preference, auth, homepage or A/B change is included.
- The new 440 by 956 check reproduces 85 pixels of unnecessary interior space on the delivered CSS. With the correction it fits the content within two pixels of its normal padding, and a long description plus seller note scrolls while settings remain stationary. The full responsive browser check passes 48 layout cases across phone, landscape, tablet, desktop and translated interfaces. Full production gate and live acceptance follow separately.

## App entry routing correction, October 19, 2026

- Owner screenshot at `/app` showed sign-in instead of the agreed interactive preview. Reproduced on deployed `42f2131` at 440 by 956 pixels: saving a style and revisiting `/app` hid the preview because a pending browser choice was treated as a request to resume sign-in. This was an implementation mistake in the public entry route, not a homepage A/B change.
- Normal anonymous `/app` visits now show the preview with the saved selection restored. Use this style and Skip explicitly enter `?signin=1`, so refreshing during sign-in retains that step. Change listing style removes that flag and restores the preview. The header icon continues to open direct sign-in. Browser preferences, provider callbacks, one-time application and returning authenticated accounts keep their existing behavior.
- The new affected-path browser regression fails on the delivered code and passes with the correction. All nine compiled browser cases pass, including Google, email code, email link, cancellation, direct sign-in, saved styles, returning sessions and the 47 layout checks. Production gate and live acceptance follow separately. No UI helper text, homepage/experiment edits, real accounts, emails, generations, purchases or marketplace actions are included.
- Production acceptance: the guarded push passed lint, types, build, formatting and 1,032 tests (four unrelated opt-in tests skipped), moving `origin/main` to `0c2a592f3a729052ffa0496b64827bd30ce5eb67`. Production deployment `4qhj61fVM4m6D9wuzGMK8urZx7YD` completed at `2026-10-19T15:08:26Z`. Live assets at the owner's 440 by 956 viewport now pass saved-choice revisits and reloads, explicit sign-in reload, Change listing style, header sign-in and brand-link return, with the preference envelope unchanged and no page errors. Eight marketing homepage snapshots still match. [Affected-path evidence](qa/growth/app-entry-routing-2026-10-19/live-acceptance.json). This delivery timestamp also marks the common entry-funnel correction for growth analysis. Acceptance evidence is retained locally after deployment.

## Style CTA visibility, October 19, 2026

- Owner requested a more visible Use this style action and a clear upward shadow on its fixed bar. Added a steady blue halo, a visible keyboard outline and an opaque fixed bar with an upward shadow on phone widths and very short windows. There is no continuous animation or flashing. Homepage and experiment code remain unchanged.
- Reproduced the old action falling below a 568 by 320 landscape viewport (bottom at 445 pixels). Short windows now scroll the example and controls while keeping the action outside that scrolling content, with bottom clearance and safe-area spacing. Normal desktop keeps its existing two-column layout. Language menus retain their existing overflow behavior.
- Expanded actual compiled-browser regression coverage to all 18 UI translations on the shortest phone and landscape layouts, additional tablet/desktop sizes, pointer hit testing, language selection and CTA visibility after scrolling. The original CSS failed the new 320-pixel landscape assertion. Larger phone text is checked separately. Final gate and live acceptance follow below.
- Owner noticed excessive whitespace above the fixed bar. The preview now uses the measured space above the bar with a 12-pixel margin, accounting for translated labels, errors and window resizing. The old spacing failed the new maximum-gap assertion. Extremely short windows retain scrollable content rather than clipping settings.
- The description-writing guides in English and German now show a readable, responsive before/after comparison directly after the description structure and before the existing web/extension CTA. It reuses the prepared app-preview text and hashtags under an Example heading and replaces the buried comparison with unverified condition and measurement details. Owner review removed the poor screenshot crop, secondary card labels and explanatory footer. No claim about generated output or sales improvement is implied by this illustrative comparison. The compact-copy rule applies to every added surface; necessary error recovery remains.
- Final local acceptance: all eight compiled-browser sign-in/style cases pass, including 47 layout cases across all 18 UI languages, breakpoint boundaries, rotation and larger phone text. Six article checks at 320/390/1440 pixels pass with readable text, no overflow, correct locale, hashtags and comparison-before-CTA order. Phone, short landscape and desktop captures were inspected. [CTA evidence](qa/growth/style-cta-visibility-2026-10-19/layout-checks.json) and [comparison evidence](qa/growth/description-comparison-2026-10-19/checks.json). Full production gate and deployed acceptance are recorded separately. Real provider UI, physical phones and purchases remain untested by these fixture checks.
- Production acceptance: guarded `push:production` passed lint, types, build, formatting and 1,031 tests (four unrelated opt-in tests skipped), then moved `origin/main` from `fd770e5` to `42f21318c24f5c826caf190abd2e9c3583f95b08`. Vercel deployment `6hzGfwY4ffVSPxcj73byn1nEJfLp` completed at `2026-10-19T14:55:35Z`. Live app checks at 320/390/568/768/1440 pixels passed preview, shadow/glow, persistent choices, reload, direct sign-in and zero page errors. Normal phone layouts have a measured 12-pixel gap; very short windows scroll the content while keeping the CTA visible. Six live article checks passed clean Before/After cards with hashtags, no photo/helper labels, and both 48-pixel-or-larger CTA targets immediately below the comparison. Eight normalized live homepage snapshots are unchanged. [Live evidence](qa/growth/style-cta-visibility-2026-10-19/live-release-acceptance.json). This acceptance addendum is retained locally after deployment.

## Search entry pages and style before sign-in, October 19, 2026

- Prepared locally in `codex/blog-web-app-entry` from production reference `fee91d9`. The owner approved implementing the entry flow and explicitly excluded the homepage and its A/B test. The owner subsequently authorized production publication on October 19.
- Four existing articles (English/German descriptions and English multi-item/batch guides) now offer the web app alongside the extension. The existing description-generator page offers both routes, with a web-app phone sticky action. Desktop batch guidance keeps the extension prominent. Existing tracking events and entry references are reused. Twenty layout checks at 320/390/768/1440 pixels passed, with 48-pixel action targets, no horizontal overflow, a non-obscured generator footer and all five article/tool-to-app references preserved.
- The real interactive style example now appears before authentication. Use this style validates and verifies a durable browser write before showing sign-in. The authenticated app applies the choice once to its account before mounting drafts; stale batch defaults cannot supersede it. Skip and the header user icon open the existing sign-in/create-account flow without replacing existing account preferences. A selected style remains editable from sign-in. Returning sessions go straight to the workspace.
- Local Chromium exercised actual compiled app and Supabase client code with external auth/network responses isolated: Google redirect, email code, same-browser email link in a new tab, cancelled sign-in, retry, skip, direct header sign-in, returning sessions, storage failure, stale defaults and later edits. No real customer/account, external email, generation, purchase or live marketplace action was used. Small phone, phone, landscape, tablet and desktop sizes were checked, with actual mobile and desktop screenshots inspected. Copy remains compact; the only added email guidance explains that the link must open in the same browser to retain the selected style.
- Limitation: pending preferences and existing account defaults are browser-local. Moving to another browser/device or clearing browser storage does not transfer them. Production provider UI, real mail delivery, physical-device rendering and live generation were not exercised. No server preference migration or credential change is included.
- Homepage layouts, shared site navigation, experiment assignment, variants, dates and primary outcome definition are unchanged. Eight normalized generated homepage snapshots matched the pre-change baseline. The common app funnel changes at release, so record its actual deployment time when interpreting the ongoing experiment.
- Evidence: [style preview on phone](qa/growth/pre-auth-style-2026-10-19/preview-390.png), [style preview on desktop](qa/growth/pre-auth-style-2026-10-19/preview-1440.png), [sign-in after selection](qa/growth/pre-auth-style-2026-10-19/sign-in-after-style.png), [layout measurements](qa/growth/pre-auth-style-2026-10-19/layout-checks.json), and [article/tool entry checks](qa/growth/blog-web-entry-2026-10-19/checks.json). Full local `verify:production` passed lint, type checking, 132-page build, formatting and 1,009 tests across 136 passing files. This includes all eight controlled pre-auth browser cases; four unrelated opt-in tests remain skipped. Inline release review checked mobile layout, compact copy, exact routes, privacy and one-time preference application. Production acceptance remains pending publication approval.
- Production acceptance: integrated with current `origin/main` (`0bd50be`) in an isolated clean release checkout. Guarded `npm run push:production` passed lint, types, build, formatting and 1,031 tests (four unrelated opt-in tests skipped), then pushed `fd770e599800c60e5b6d5f82c3d5facc563269dc` to `main`. Vercel production deployment `6ijuWGWsBHuK7tPsJxTsjUhKgNAW` completed at `2026-10-19T14:31:05Z`. Use this time when segmenting the common app funnel in the ongoing homepage experiment.
- Live acceptance passed on `https://autolister.app`: preview, visible direct sign-in icon, durable selection before auth, reload and direct sign-in preservation at 320/390/768/1440 pixels, plus fresh direct sign-in. All ten article/tool checks (five pages at phone/desktop widths) retained both routes, exact entry references and no horizontal overflow. Eight normalized live homepage snapshots matched their pre-release values. Production API/auth/telemetry calls were intercepted for these UI checks; no real sign-in, email, generation or purchase was performed. [Live release evidence](qa/growth/pre-auth-style-2026-10-19/live-release-acceptance.json). This acceptance addendum is retained locally after the deployed commit.

## Listing style setup, October 15, 2026

- Tracking follow-up: keep Skip and its direct Add item handoff. Normal paywall views use `reason` plus a separate `entryPoint`, carried into checkout without replacing acquisition source or session identity. Final style events include all three extra switches; fix the backend filter dropping Short/Long and retain the small onboarding/pricing fields through routine cleanup. Local browser, endpoint, transport and PostgreSQL checks cover privacy, attribution and expiry. [Tracking QA and migration](qa/style-tracking-cleanup-20261015.md).

- Header follow-up: reproduced the owner's screenshot as a zero-pixel gap between the shared header divider and onboarding title. Add 8 to 12 pixels of scoped separation, taking the space from the scrollable example. All 18 languages on the shortest phone and seven additional sizes keep the primary action visible; the original zero-gap assertion fails and corrected measurements pass. Updated screenshot and measurements are in the flow audit.

- Owner-approved integration of the reviewed style preview into the real web app. Eligible new accounts see a compact, translated, photo-based example once, then proceed directly to Add item. Existing accounts and saved preferences are preserved. Fresh web preferences use Short; extension defaults, model-pilot assignment and generation prompt text are unchanged.
- The compiled frontend's local journey reached photo preparation, a stubbed draft response, saved review and exact copying of both fields. Checked independent languages, Short/Long, bullets/text, both extras off, empty/user-entered notes, dismissal, Skip, return visits and saved Long. Fixed the extras merge order and clipped actions on small translated screens. No paid generation, real signup, customer setting change or marketplace publication was used for QA.
- All 18 languages fit 320 by 480 with visible primary actions and 44-pixel buttons. Additional phone, landscape, tablet and desktop sizes passed. Seven measured note-dialog cycles had no detected long tasks or page scrolling; physical-phone smoothness remains unmeasured. The style screen uses prepared copy and lazy loading with no new UI dependency.
- Keep Google plus passwordless email for this release. Apple sign-in remains a separate potential improvement rather than a launch blocker. [Flow audit, screenshots, checks and limitations](qa/style-onboarding-release-20261015.md). Production publication is authorized by the owner's latest message and uses the normal guarded main push.

## Mobile paywall and Google branding, October 14, 2026

- Plan taps now select native radio choices without a checkout request. A separate Continue CTA stays visible within a bounded phone dialog. The existing tailored paywalls, prices, quotas, account-pause rules and bearer-owned Stripe routes are preserved. Actual Chromium flow tests passed 24 checks, including keyboard selection, double-tap prevention, failed checkout retry, portal recovery, saved drafts and 320/360/390px layouts. No customer purchase was made. Evidence and release status: [mobile paywall and branding QA](qa/mobile-paywall-branding-20261014.md).
- Matched the live Supabase Google client to its Google Cloud project. Saved the AutoLister name, moved OAuth from Testing to Production with explicit user confirmation, and corrected obsolete privacy/terms URLs. No credentials, scopes or callbacks were changed. The privacy policy now describes Google sign-in and the web app. The original branding check failed on the obsolete policy URL; final verification follows the policy release. Google approval is separate from a website push.
- Live acceptance: production gate passed 956 tests in 129 files, main moved to `dcd9d2a`, and Vercel `EMUFMBMCPjsGWJ2xcuNCmCyt2W3N` reached Ready. All 24 controlled browser flow checks passed on deployed assets. Google verified and published the branding after the policy repair; the real account chooser now shows AutoLister and its logo. No account was selected and no live purchase was made during acceptance.

## Mobile homepage test release, October 12, 2026

- Shared visual refinement: phone/tablet feature bullets are now plain checkmarked list items rather than bordered cards that resemble the Chrome install button. Both A/B arms keep the same copy, routes, assignment and demo behavior. The existing computer hint in B gains a decorative laptop icon from the installed icon set, with no dependency or extra script. Twenty existing native homepage checks and eight rendered A/B checks at 320/390/768/1440px pass, including no overflow, a 48px Chrome click target, unboxed proof text and unchanged desktop geometry. Phone and desktop screenshots were inspected; guarded production verification and live acceptance follow.
- The user accepted the demo-first A versus app-first B comparison and a stable 50/50 phone split. This supersedes the earlier deferral below. Keep Assistant, the established headline and compatibility wording identical. Phone-only lower-page instructions now offer the web app in both arms; desktop keeps its existing extension route. Eight locales are translated. The full demo remains, with a 31 KB poster from its actual finished listing at 40 seconds.
- Native Chromium passed 20 homepage checks: first visible frame, stable allocation at 320/360/390px, localized layout, unchanged desktop geometry, blocked storage, normal and denied autoplay in both arms, and a buffered first tap where fullscreen consumes the gesture. Playback starts before requesting fullscreen; native video controls retain normal behavior. Physical iPhone Safari remains untested. The separate app journey passed 21 checks, including checkout/pause/quota prompts, correct local photo inputs, long-description scrolling, exact CTA positioning and overlay dismissal. Admin HTML passed desktop/phone modal cycles and readable A/B metrics without production requests.
- Existing durable telemetry supplies exposure/browser/variant and preserves occurrence time on delayed website events. The authenticated generation API records only a bounded pseudonymous browser ID beside its existing count metadata; input image processing, retry hash, usage commits and extension behavior are unchanged. The existing admin Web app report compares same-browser verified generation, copying, extension intent and Stripe-confirmed activation. Seven-day mature cohorts supply rates and Wilson intervals; no automatic winner. Unidentified or ambiguous multi-browser payments are not attributed. Known server-classified crawlers and identifiable internal browser evidence are excluded; anonymous activity without such evidence remains a measurement limit.
- Enrollment runs through November 2 UTC, then assigned browsers retain their layout until outcomes finish November 9. Export aggregate results before normal 30-day cleanup. The tested `2026-10-12_web_metric_outcomes.sql` replaces only the existing service-role cleanup function. Photos, prompts, generated text, request identifiers such as IP/email and Stripe identifiers still expire on the existing heavy-evidence schedule. Tiny count/run/paywall/experiment/payment fields remain within the existing 30-day log retention. No table, grant, service, realtime polling or new photo storage is added.
- Release candidate acceptance: real PostgreSQL-compatible event ingestion and cleanup tests reproduced missing occurrence timestamps and dropped count/browser fields before repair. Fixture endpoint tests reject client success/payment claims, isolate browser cohorts and verify that analytics metadata cannot change generation identity. Full guarded main push, production function readback, Vercel READY and live acceptance are the final release steps. No customer account, listing, purchase or email was changed for QA.
- Production acceptance: `bc27dba` moved main after 937 tests in 127 files, including real HTTP retry/database checks. Vercel `dpl_7rCT87abgkrrFmBfrECJ7umBnhna` is READY for autolister.app. All four live A/B autoplay/blocked-autoplay checks play on the first tap with zero page errors and no telemetry sent. The real admin report responds 200 with the two experiment arms and an untruncated sample. Cleanup function readback confirms the new fields and unchanged service-role-only execution.
- Final visibility check reproduced an existing log-search 500 from its separate exact-count query, while the requested rows were already available. Search now reads at most one extra row to prove Next, without counting the full matched history or inventing totals. Unfiltered log pagination retains exact totals. Endpoint regression and native desktop/phone search pagination, modal and A/B report checks pass. This follow-up uses no new query service, table or index; its guarded push/live acceptance follows.
- Live search validation found the wildcard row query also timed out for a rare event at a normal 50-row page size. Production index inspection confirms existing endpoint, user-id, created-at and IP indexes. Known event names/full endpoint paths now use exact indexed matches; email/account UUID searches resolve the small profile record and use its indexed user ID, preserving all retained account history. Remaining broad free-text/client-ID searches default to the existing 30-day metric window and state that window in the footer; an explicit API start date overrides it. The real production EXPLAIN for web_app_view confirms an Index Scan using idx_api_logs_endpoint. No new indexes, tables or search service are added.

## Public web beta, October 12, 2026

- Owner approved optional home-screen support without an install popup, plus a compact New badge above the multiple-item tab. Enabled app/callback metadata uses the existing icons and an app-only manifest; one small listener suppresses automatic install prompts. No service worker, cached app shell, install CTA, polling, dependency or database change. Native manifest parsing/icon checks and the 22-step browser journey pass. Physical installed-phone auth/checkout handoffs and Safari-to-installed-app local draft transfer are not claimed verified. [QA and remaining device checks](qa/2026-10-12-app-home-screen.md).
- Web checkout is live: extension primary limit and paused-account prompts, bearer-owned one-time packs, and local editor return through Stripe. Both guarded pushes passed 893 tests; `04a9576` is READY. Real Starter EUR 3.99/month and 20-credit EUR 5.99 one-time Stripe checkouts opened and cancelled back to the app. No payment or customer generation was made. [Regression evidence and live-check limits](qa/2026-10-12-web-checkout-paywalls.md).
- Mobile homepage A/B decision: defer splitting traffic. Search Console, Web search, September 13 to October 10, all eight canonical homepage URLs, Mobile filter: 646 clicks, 4,233 impressions, 15.3% CTR, average position 3. About 23 Google mobile clicks/day is not unique site visitors or app conversion. Largest queries were “ai listing agent for vinted” (231 clicks), “vinted ai listing agent” (106), “ai vinted listing agent” (56), and “ai listing agent vinted” (36). Keep the localized AI listing headline, compatibility phrase and demo. Existing 30-day web metrics at the October 12 read had five homepage CTA events, two app visits, one tracked signup and one server-confirmed activation, zero copies/checkout starts/current paid users. Some anonymous launch activity was QA, so this is an immature baseline rather than verified customer conversion. Measure activation and paid outcomes before choosing a substantial test. No guessed variant, SEO redirect or new experiment infrastructure was published.
- Admin Users adds a separate observed Web app marker using existing logs. Desktop Chrome can offer the extension after successful copying, with seven-day browser/account dismissal and installed-extension checks. Phones retain their usable web app flow. The full guarded gate passed 907 tests in 125 files, including browser/HTTP retry checks, followed by `bfbca8d` on main. The 19-step rendered app journey and three admin widths pass. Visual review also reproduced and fixed closed sidebar text flashing during a mobile resize by narrowing inherited visibility transitions. Deployment readiness and live marker acceptance follow publication.
- At 15:44 UTC, the sidebar fix `c8abf14` is also on main after the complete 907-test gate; GitHub CI is green. Vercel's dashboard/API still serves `04a9576` and has no records for the last two commits. Its active [build/Git integration incident](https://www.vercel-status.com/incidents/sps6n39gm4sg) is consistent with this delay. The redesigned paywall and tested Stripe opening/cancellation are live; the Users marker and extension prompt are awaiting deployment and live acceptance. No forced deployment or permission changes were attempted.
- Follow-up: the install button explicitly names the extension in all eight site languages. All 19 rendered viewport/locale checks and the guarded 876-test production gate passed. Deployment `dpl_8FEnk5UUnm5ec4YYyisXnpfWjKZs` is READY for `ebf1206`; all eight live homepages return the translated label and app route. No customer account or generation was used.
- Owner approved publishing the compact dual-route homepage and public local-draft web app. Homepage-only Search Console queries support preserving the current AI listing headline and compatibility phrase. The demo remains visible and the header counter is compact plain text.
- The existing admin gains `/admin/web-app`: browser visits, verified sign-ins, same-browser new signups, server-confirmed generations, copies, returning generators and current paid entitlement. Retries/recovered results count once. Anonymous activity is directional and client-reported; current paid entitlement is not a new-payment or revenue metric.
- Existing telemetry/log storage is reused. An additive service-only compaction function preserves only small web metrics for 30 days; no new table, cloud draft persistence, quota change or extension release. Production callback/config preparation preserves existing auth and private preview protection.
- Independent review identified and confirmed the fix for checkout-event retention. Full production gate passed 875 tests in 123 files, real browser/HTTP retry tests, rendered mobile/desktop checks and existing 16-step draft plus five-scenario settings journeys. Detailed evidence and untested steps: [public-web-beta-2026-10-12.md](qa/public-web-beta-2026-10-12.md). Final live-route and READY deployment verification follows the guarded production push.
- Final acceptance: guarded main push passed 876 tests; READY deployment `dpl_92TBFsmGDTYVTPpxHdFLoY5HxpMx` serves source `e62b5a5`. Public `/beta` and the homepage CTA reach `/app`; existing owner Google sign-in, real usage, the admin view/guard and live visit/click ingestion were verified. Cloud drafts stay disabled. No customer generation, purchase or new signup was used. The observed one anonymous visit and two homepage clicks are QA, not growth outcomes. Earlier local preview drafts remain at their original origin. See the linked QA report for physical-phone and conversion limits.

## Draft model Fast pilot, October 12, 2026

- Owner approved shipping a stable 50% account pilot of GPT-6.1 Sol Fast, including existing and new accounts, while continuing to investigate larger-photo costs. The control remains GPT-5.4. High-detail photos, low reasoning, strict JSON, 1,000 output tokens and explicit caching without breakpoints preserve the audited configuration and unchanged prompt text.
- Photo-volume evidence matters: the controlled audit averaged 4.3 photos and capped every listing at five. The broader October production check covered 472 priced baseline calls with mean 5.79 photos; 80 calls had six to eight and 98 had more than eight. Larger-set Sol pricing is an open question, not a verified saving. The existing production bill already includes larger uploads.
- The first review is after 50 successful real pilot drafts, including failures, unique sellers, photo-count coverage, costs, actual service tiers, cache writes and timings. The scheduled read-only follow-up stays quiet until meaningful risk or review readiness. It cannot generate drafts, edit prompts, publish or expand the rollout automatically. No additional paid release-test generations were run.
- Rollback and acceptance details: [draft-model-fast-pilot.md](draft-model-fast-pilot.md). Release checks and deployment verification are recorded after the guarded production push.

## Admin acquisition badges, October 1, 2026

- Every mobile user card and desktop row now has a compact acquisition badge beside the email. Recognised channels have readable brand labels; unfamiliar valid campaign source names and external referring hostnames are retained and displayed. Missing evidence shows Unknown, with a tooltip distinguishing absent evidence from temporary read failure. Direct is shown only for explicit saved direct evidence, and referring-host evidence takes priority over a direct tag. No historical origins are invented.
- Website first-touch capture, auth callback, claim sanitization and admin user enrichment preserve safe source slugs up to 80 characters and domain-only referrers. Full referrer URLs, paths and query strings are discarded. Internal, IP-address and malformed referrers are excluded. Existing first touches remain immutable; authenticated user ownership and admin access are unchanged.
- Tests were observed failing before implementation, then passed. Full local verify:production passed lint, type-check, formatting, build (130 pages), 75 test files and 438 tests. Admin UI, endpoint joins, fallback read failure, custom sources, referrers and signup handoff have targeted coverage. No real signup, install, generation, payment, outreach or marketplace operation was performed.
- Migration 2026-10-01_custom_attribution_sources.sql is prepared and must be applied before deployment. It broadens only the source metadata check to safe bounded slugs. Existing rows and RLS are unchanged. Independent code review passed with no Critical or Important findings. On the user's explicit Deploy instruction, the migration was applied using existing authenticated Supabase Management API access. A read-only verification confirms the safe-source check is validated and RLS remains enabled. Production push is now proceeding. Browser control continues to time out, so actual mobile/desktop visual verification remains unavailable.

## X signup attribution and share-card refresh, October 1, 2026

- User approved the production database update and deployment. Migration `2026-10-01_x_user_attributions.sql` was applied in Supabase project `jqloiovdwjaornnfvmyu`. A read-only constraint query confirms `x` is allowed and the constraint is validated. Existing rows and RLS remain intact; no fake user or attribution row was created.
- X first-touch capture, website auth callback and backend sanitization now accept `x` with exact X, Twitter and t.co referrers. The existing Admin Acquisition Source cohorts table reports X claims, new signups, successful-generation activation and current paid status separately. Same-browser attribution remains a limitation; no real signup, install, generation or payment journey was exercised.
- The live site already served the newer photo-based artwork, but native X composer checks of the original tagged homepage URL and a fresh UTM query both showed the older purple card and old alt text. This demonstrates a stale X card rather than the live site serving the old image.
- New short share URL: https://autolister.app/x. It renders the existing homepage with a distinct social URL and adds default X UTMs before analytics. Explicit campaign/content values remain intact. The existing current artwork is copied unchanged to `social-card-oct2026.png` so the image also has a new URL. No social post was sent. Final native X preview verification follows deployment.
- Release prepared from current production commit `cf51cf6` in an isolated checkout, preserving the production artwork and paid welcome-email changes. Existing local documentation and unfinished changes were not included in this release. Attribution review passed with no Critical or Important findings; final route review and guarded production push follow.

This is the durable source of truth for current growth work. Chat is temporary; if Codex makes or changes a growth decision, update this file in the same change.

## Mobile web idempotency migration canary, September 24, 2026

- Applied the additive `migrations/2026-09-23_mobile_web_generation_idempotency.sql` migration to the verified production Supabase project `jqloiovdwjaornnfvmyu` through the existing authenticated Supabase CLI Management API path: `supabase db query --linked --project-ref ... --file ...`. The migration record was captured at 2026-09-24T05:20:21Z. Migration SHA-256: `83920859fffc58bfbee1f4f251d9e2f05f99e132c9bce95a08aa9c84e39983b1`.
- Read-only preflight found the target table, indexes and functions absent, while `pgcrypto`, `profiles`, `generation_reservations`, and the existing reservation/refund functions were present. No customer rows were read.
- Post-apply verification found `public.mobile_generation_idempotency` present with row-level security enabled, zero policies, no table SELECT for `public`, `anon`, or `authenticated`, and service-role table access only. All nine reviewed functions are security definer functions with fixed search paths, executable by `service_role` only. The three indexes are valid, including the unique `(user_id, client, request_id)` index.
- No Vercel deployment, feature-flag change, Stripe change, credential change, or generation was performed. The SQL was executed through the management API rather than the repository migration-history runner because this repository has no Supabase migration configuration or remote migration history table.

## Current Operating Goal

- Period: 2026-07-06 to 2026-08-02
- Goal: make AutoLister AI the obvious "AI Vinted listing helper" for sellers who want faster titles, descriptions, and hashtags from photos.
- Primary market: France first.
- Secondary market: Netherlands/Belgium.
- Constraint: 5-8 operator hours per week.
- Paid-test budget: EUR 300-500 per month.
- Status: waiting for the next Monday admin metrics refresh before changing targets.

## Weekly Review Ritual

Run this every Monday.

1. Refresh the Chrome Web Store `Last 30 days` snapshot if the reporting period changed.
2. Check `/admin/logs`, `/admin/users`, and `/admin/costs` for the specific product metrics needed for the review.
3. Ask Codex: `Run growth review. Read docs/growth-playbook.md, docs/growth-current-sprint.md, docs/blog-content-plan.md, and these current admin/Chrome Store metrics. Update the sprint plan if the decision changes.`
4. Record this week's decision in the Decision Log below.
5. Keep only three active weekly actions.

Daily rule: inspect only the metric needed for the current action, record one result, then stop.

## Current Weekly Actions

Refresh these after the Monday review. Until then, do not start new growth side quests.

| Priority | Action                                                            | Channel      | Market   | Success metric                         | Status  |
| -------- | ----------------------------------------------------------------- | ------------ | -------- | -------------------------------------- | ------- |
| 1        | Refresh admin metrics and Chrome Store snapshot                   | Measurement  | All      | Current 30-day snapshot saved          | Pending |
| 2        | Pick one store or trust improvement from the refreshed bottleneck | Chrome Store | FR/NL    | Better install quality or more ratings | Pending |
| 3        | Pick one acquisition/content action from the refreshed bottleneck | SEO/outreach | FR first | Active generators, not clicks          | Pending |

## 2026-10-12: Local photo editor QA

- Follow-up: added an adjustable solid-cover privacy brush with Undo and a single contextual tool row. Actual Chromium passed 24 journey checks, including mouse/touch painting, exported-pixel accuracy, unpainted-region preservation, source alignment through crop/rotate/angle changes, exact original restore and flattened-JPEG download/generation. No new dependency, backend or AI cost. Physical phones remain untested.
- Added the approved free crop, rotate/straighten and restore-original controls through existing photo menus. The editor is loaded only on demand; edits and the first prepared JPEG backup stay in the existing local blob store and count toward its cap. No new backend/infra, quota, payment or extension changes.
- Actual Chromium passed 23 journey checks, including mouse/touch crop, keyboard straighten, exported rotation pixels/source dimensions, exact downloaded/restore JPEG bytes, edited-photo generation upload, repeated fast dismissal and existing paywall/batch/local-draft flows. Phone and desktop captures inspected at 320/390/768/1440px. Storage tests passed 14 cases. [Evidence and test limits](qa/local-photo-editor-20261012.md).
- Physical phone gestures/native download and low-memory behavior remain untested. This does not establish conversion uplift; no purchase or marketplace listing was performed.

## Active Experiments

Use this table for any growth action that takes more than one day or spends money.

| ID              | Hypothesis             | Channel | Market | Action                                    | Budget | Start      | End | Success metric | Result | Decision |
| --------------- | ---------------------- | ------- | ------ | ----------------------------------------- | -----: | ---------- | --- | -------------- | ------ | -------- |
| G-2026-07-06-01 | Pending Monday refresh | TBD     | TBD    | Do not launch until baseline is refreshed |  EUR 0 | 2026-07-06 | TBD | TBD            | TBD    | Pending  |

## Metrics To Refresh

Source: `/admin/logs`, `/admin/users`, `/admin/costs`, Stripe, and Chrome Web Store Developer Dashboard.

| Metric                   | Latest value | Date | Notes             |
| ------------------------ | -----------: | ---- | ----------------- |
| Chrome Store page views  |          TBD | TBD  | Last 30 days only |
| Chrome Store installs    |          TBD | TBD  | Last 30 days only |
| Chrome Store uninstalls  |          TBD | TBD  | Last 30 days only |
| Chrome weekly users      |          TBD | TBD  | CWS snapshot      |
| Chrome rating count      |          TBD | TBD  | Lifetime count    |
| 30-day signups           |          TBD | TBD  | `/admin/users`    |
| 30-day active generators |          TBD | TBD  | `/admin/logs`     |
| 2+ generation users      |          TBD | TBD  | `/admin/logs`     |
| quota pressure users     |          TBD | TBD  | `/admin/users`    |
| limit hits               |          TBD | TBD  | `/admin/logs`     |
| paywalls shown           |          TBD | TBD  | `/admin/logs`     |
| checkout starts          |          TBD | TBD  | `/admin/logs`     |
| paid profiles            |          TBD | TBD  | `/admin/users`    |
| MRR                      |          TBD | TBD  | Stripe            |

## Decision Log

Append one row whenever the weekly focus changes or an experiment ends.

| Date       | Decision                                                           | Reason                                                                                                                                                      | Result/Follow-up                                                         |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2026-07-04 | Reposition homepage hero copy toward "Vinted AI listing assistant" | GSC query demand is clustered around "vinted ai", "vinted ai listing", and "vinted description generator"; old H1 was "The Only AI Vinted Lister You Need." | Review homepage GSC and hero CTA movement on 2026-07-18 and 2026-08-01   |
| 2026-07-04 | Created durable growth sprint tracker                              | Growth plans in chat are not durable enough for recurring execution                                                                                         | Next Monday review must fill current metrics and replace pending actions |

## Operating Rules

- The sprint doc is the durable memory. Use focused admin routes for live metrics.
- Do not judge growth work by impressions, clicks, or email opens alone.
- Count installs, signups, successful generations, 2+ generation users, paywalls, checkouts, paid users, ratings, and replies.
- Do not scale paid traffic unless activation and value depth are healthy.
- Do not position AutoLister AI as Vinted automation, botting, auto-like, auto-follow, buyer messaging, relisting, or account control software.
- Keep "Vinted description generator" visible in high-intent acquisition copy.
- Every experiment needs a hypothesis, channel, market, action, budget, date range, success metric, result, and decision.

## 2026-10-14: Web journey audit and batch pacing

- Read-only event and API details show eight successful generations from today's checked web cohort and one genuine burst-limit failure during a five-item trial batch. The requested account uploaded one photo and explored plans without a recorded generation/error. Saved-session restores are not repeated sign-in failures. Logs cannot prove why a user stopped. [Evidence and limits](qa/web-journeys-burst-focus-20261014.md).
- Free and Starter request ceilings become 20/minute across web and extension, independent of remaining credits. Pro/Business remain 20/30. Trial, daily/monthly, billing and abuse protections are unchanged. No batch wait, migration or new service is added.
- Eleven production-SQL regressions and 24 actual Chromium flows pass, including full trial/paid batches, retained quotas and keyboard/pointer focus behavior. Release-gate and deployed acceptance are recorded separately; physical Safari remains untested.

## 2026-10-09: Listing preparation app QA

- Implemented the accepted `/app` design on isolated `codex/mobile-web-phase1`: photo-first home, separate Add item/Add several, persistent grouping, readable review/copy, manual Listed/restore, and compact auth/account/settings. API contracts and persisted draft/done states are unchanged; this redesign adds no migration.
- Final gate passes lint, types, feature-enabled build (132 pages), formatting and 817 tests. Local intercepted Chromium passes 44 journey checks plus six review regressions, with zero page errors. Actual layouts and menus inspected at 360, 390, 768 and 1440px; keyboard/focus, selected touch targets, palette contrast and CSS zoom checks pass. [Evidence and captures](qa/browser-drafts/redesign-progress.md).
- The local final link is `http://127.0.0.1:4331/app/`, using fixture auth/provider/storage/billing responses. It covers upload, generation, review, exact clipboard copy/fallback, Listed, account error handling, quota/pause/failure and unsaved/conflict recovery. It does not verify live signup, OAuth, billing or first value on a deployed destination.
- Unresolved release checks: physical iOS/Android camera/gallery/HEIC/orientation/keyboard/clipboard; real staging auth/Storage/provider/Stripe integration and PostgreSQL concurrency. These block deployment until checked. No publishing, outreach, spend or production changes occurred. Activation/conversion remains unmeasured; no growth outcome is claimed.
- Interactive review link corrected to `http://localhost:4340/app/`: the existing local fixture server opens a demo account automatically and serves the rebuilt UI. Exact-link Chromium checks pass for real sample-photo preparation/upload, simulated generation, edit/save/reload, exact clipboard copy and Listed/restore, with no external requests or page errors. The phone capture was inspected. The visible demo label distinguishes this from real authentication; data lives in server memory and resets on restart. Scripts and capture are `/tmp/autolister-draft-preview.mjs`, `/tmp/autolister-draft-preview-fixtures.mjs`, `/tmp/autolister-draft-preview-check-final.mjs`, and `/tmp/autolister-draft-preview-final-phone.png`. The earlier port 4331 UI-only link cannot authenticate with its test configuration.

## 2026-10-12: First paid web app journey and reporting repair

- Confirmed an active Starter subscription from the iOS web-app journey, followed by seven paid generations and useful copies. Five free generations did not consume the paid daily allowance. A prior cancelled checkout is observed, but its reason is unknown. [Detailed audit](qa/web-app-first-paid-journey-20261012.md).
- Reproduced and repaired JSON-null photo metadata crashing admin View. Compact list projections now include scalar counts and payment outcomes; no extra photo copies, database tables, analytics service or polling are added.
- Generation run size/method and paid-option reason are bounded business events in the existing durable queue. Successful mobile generation logging runs after durable result/allowance commits without delaying the response.
- Shared website Google tag array queue was independently reproduced as failing with Google's actual SDK, with collection requests intercepted. Canonical arguments queue passes the negative-control browser check. This restores measurement rather than establishing a conversion baseline.
- Actual local Chromium journey passed 20 checks: ten photos, local/offline persistence, long descriptions, stable Generate/Listed position, batch generation, every tailored quota/pause paywall, bearer checkout retry/cancel, lost-result recovery, exact copies, selection/deletion and fast overlay close at 360/390/768/1440. The new batch/paywall/copy telemetry assertions pass. No live marketplace or payment was exercised by this fixture run.
- Full production gate passed lint, types, build, formatting and 911 tests in 125 files, including real Chromium/socket-loss/concurrent-request/database recovery checks. Six actual admin modal open/close cycles pass at desktop and phone widths. Deployment acceptance is checked separately after guarded push.
- Reporting repair a95112e reached origin/main through the guarded push and production deployment dpl_5fLL7kRPR69NKB4QVR8JK9wNALXn reached READY. Live admin View opens the real web generation with its recorded two-photo count. Paid activation and checkout outcomes are explicit in the feed. The account was not changed.
- Follow-up phone journey passes 21 checks, including bearer billing reaching its endpoint while telemetry preparation is held unresolved. The old handler failed that controlled regression. Billing and quota rules are unchanged.
- [Homepage experiment evidence](qa/homepage-mobile-experiment-20261012.md) supports one mobile-only hero test after measurement repair: 646 mobile versus 103 desktop Google clicks across localized homepages in the checked 28 days. A/B is a local design preview only; no experiment assignment or homepage layout change is deployed. Headline, compatibility copy, full demo and desktop layout are preserved. Lower-page extension-only instructions/CTA need a common correction before testing.

## 2026-09-30: Consistent social preview artwork

- Found a remaining `banner.png` fallback in blog metadata. The September artwork update reused its existing image URL, allowing cached previews to retain earlier artwork.
- All 117 pages with social metadata now share `social-card-sep2026.png?v=20260930` for Open Graph and Twitter. Removed page-specific image overrides, corrected Twitter tags to use `name`, and aligned alt text with the current artwork.
- Reviewed the actual 1200x630 artwork: AutoLister branding, readable "From photos to listing drafts" headline, and a seller photographing clothes. Existing article hero images remain in article content.
- Local build passed: 129 HTML pages, including 117 social-card pages. Parsed every generated social-card page and verified image URLs, dimensions, alt text, and Twitter attributes. No old banner remains in social metadata.
- Production gate is required before push. After deployment, verify those same 117 URLs as Twitterbot and compare the served PNG dimensions and SHA256 with the repository asset. Native platform preview caches and signup/activation are untested by this metadata change.

## 2026-10-14: Distinguish web sign-in from session restoration

- Investigated a same-visit timeline with two `auth_complete` rows. Both restored an existing session; they were separate app initializations, not duplicate delivery or two new sign-ins. Two upload events represented two photos and one generation succeeded.
- Local cleanup reserves sign-in completion for credential verification, coalesces restoration once per account/visit/tab, and hides routine restoration in the admin unless background events are requested. Failures remain visible. Unique authenticated-user and homepage cohort attribution continue to include restored users.
- [QA evidence](qa/incident-tracking/auth-event-cleanup-2026-10-14.md): full production gate, local production-build reload/retry checks, desktop/mobile admin checks and read-only validation of the activity filter. No paid generations or customer changes. Owner approved the production push on October 14; deployment acceptance is recorded separately.

## 2026-10-21: Beginner article direct web-app entry

- Confirmed the live English beginner article still used the extension-only end CTA at mobile width. The description and batch guides already use the shared web-app entry component; the beginner article was not included in that layout selection.
- Reused ListingDraftCTA in the seller section and at the end of the English beginner article. Create a draft goes directly to /app with separate refs blog_vinted_beginner_seller and blog_what-is-vinted-how-it-works_end. The extension stays secondary. Other articles and translations keep their existing routing. No new helper copy was added; existing concise route explanations distinguish copying a browser draft from generating inside Vinted.
- Local production-build browser review at 390px and 1440px viewport widths confirmed the primary web CTA, readable wrapping and no horizontal overflow. Actual document widths excluding scrollbars were 375px and 1425px. Verified exact hrefs, same-tab app navigation, web_app_click event names and distinct contexts. Built HTML checks confirmed both app links and retained routing on the existing description, batch and unrelated beginner-selling guides.
- Full npm run verify:production passed: lint, type-check, build, format-check, 139 test files passed, 1,106 tests passed. Three test files and 13 tests were skipped by the existing suite configuration. Inline scope and copy review found no added promises, redundant helper text or unrelated product changes. No new permanent test was added for this small content/routing change.
- Production publishing remains pending approval. No signup, paid generation, purchase or marketplace action was performed. These checks do not establish end-to-end conversion or revenue.

# Checkout tracking follow-up, 27 October 2026

- Prepared, not deployed: retain existing checkout events and bounded context, keep them through the existing 30-day cleanup, add missing web/welcome outcomes and exclude billing management from purchase starts. A small extension popup failure event is prepared separately for the next release. Existing payment records and previously shipped paywall fixes are preserved. [Scope, checks and limitations](qa/2026-10-27-checkout-tracking.md).

## 2026-10-28: Subscription confirmation presentation

- Reworked the unreleased confirmation to lead with a short welcome and useful plan details, followed by compact dated billing rows. Removed redundant discount and defensive wording. Required terms remain readable below. Existing archived emails are not rewritten.
- Exact HTML for all three plans, discounts/local currency and stopped renewals inspected at 390 x 844 and 1100 x 900. Complete links checked: Stripe portal, online withdrawal and support email. Independent visual/code review accepted the revised standard-Pro screenshots and conditional logic; policy review accepted the wording trims with purchased plan limits retained after cancellation. Full production gate passed 909 tests; three opt-in live tests skipped.
- [Release record and remaining prerequisites](billing-evidence-release.md). Screenshots, exact HTML hashes and gate output are in the private parent workspace folder `ops/evidence/billing-hardening-20261028`. No email was sent or production change deployed. Live hosted-checkout/provider configuration and email-client delivery remain unverified. No conversion or dispute-win improvement is claimed.

Compact subscription confirmation completed locally on 2026-10-28: full terms moved to an archived PDF attachment, exact desktop/mobile HTML and PDF visually checked, complete PDF text/links checked, independent review accepted after fast-cancel regression fix. Final production gate: 915 passed, three opt-in live tests skipped. No external send or deployment. Release prerequisites remain in docs/billing-evidence-release.md. Private QA record: ../ops/evidence/billing-hardening-20261028/compact-confirmation-review.txt.

Final owner-reviewed copy now omits selected feature highlights and product-surface links, uses Amount paid and Next renewal, and retains actual plan allowances. Checked against Paddle's published example and Mastercard confirmation guidance. Exact final desktop and 390px mobile renders inspected, links checked, and all 23 targeted email/attachment tests pass. The final captures are final-welcome-desktop.jpg and final-welcome-mobile.jpg in the task visualization directory. At this preparation stage there was no send or deployment. The cancellation-before-welcome-retry concern was subsequently fixed and independently accepted, as recorded below.

Production acceptance on 28 October 2026: explicitly approved rollout is live at application commit 16f1e82. Four migrations and private database grants verified; Resend signing secret/webhook installed; live terms/withdrawal/support and rejection-path checks passed. Hosted sandbox base and discounted GBP checkout disclosures were inspected without a purchase. The exact approved email HTML/PDF was sent once as a labeled owner test; genuine signed sent/delivered events are persisted. Full production gate passed 1,195 tests with 13 opt-in skips. No filler or extra product CTA was added. See the final production acceptance section in [the release record](billing-evidence-release.md). No live purchase or live withdrawal submission was performed; local endpoint/database tests cover receipt persistence. The existing Stripe account/seller arrangement remains unresolved separately. No conversion or dispute win rate is established.

### Private plugin final preparation, 2026-10-31

Contacted OpenAI Support with owner authorization about Persona failure versus
Individual Identity in review. Human specialist escalation confirmed. No new
verification attempt, publication, submission, invitations or deployment.

Polished the local transfer screen with larger uncropped photos, one full-width
CTA, responsive grid and accessible fallback picker. Existing independent reviewer
confirmed presentation-only changes with no actionable source issues. Worker build
and artifact validation pass; account-import tests pass 8/8. Actual local receiver
opened the fixture draft, retained the enabled note once and made zero generation
calls. Desktop and phone-width renders, four-photo layout, cap fallback, expiry
and sign-in screen checked. Local fixtures are not a real ChatGPT host walkthrough.

Evidence: `reports/ai-visibility-2026-10-28/comparison-v2/public-preparation/final-local-prep-2026-10-31.json`
in the parent workspace. Public gates remain: verification, supported canonical
Sites submission path, approved deployment, dedicated reviewer access and actual
ChatGPT demo recording. No claim of submission readiness.

### Sites submission route checked, 2026-10-31

Read the current official submission and Sites hosting guides; inspected the
canonical private plugin export, Personal plugin details and management controls,
and Platform Personal / quick-vint submission page. No self-service public
promotion action was found for this Sites App. Public ZIP uploads reject the
current App binding; the portal is also identity-gated. The connected private
App uses OAuth. No raw-server/no-auth workaround, duplicate plugin, access change,
upload or deployment was attempted. Canonical identity remains PRIVATE with
zero external Site visitors. See `docs/plugin-submission/sites-public-route.md`.

Prepared a concrete support question without sending it, plus a reviewer run
sheet. A fresh local preflight passed 25 metadata, icon and actual worker tool
contract checks. Real host cases, dedicated reviewer access and final recording
remain unverified. The four-photo label fixture is explicitly missing.

### Individual verified and private portal draft, 2026-11-01

Confirmed Verified in organization settings and Individual: Sami Shata in the
upload dialog. The inspected portable candidate ZIP was accepted as draft
`plugin_asdk_app_6ae70020f5508191a44f9b7ee36ba3c5`, version
`appsub_6ae70020f5748191b5d8584bdd1ce9c8`. The portal created a separate submission
App, not a replacement for the working private Sites App. Not submitted and not
published. Countries and 5 positive / 3 negative cases imported correctly.

OAuth is selected in the connection dialog; domain verification is required.
Prepared only the exact ownership-proof GET locally. Regression checks passed
for its response, continuing authentication on app/handoff requests, and unchanged
MCP discovery. Worker build and artifact validation passed. No deployment or
external audience/access change. Actual Sites edge access and OAuth remain
untested. Non-blocking metadata findings concern category/privacy assessment.
Supporting-content demo URL and MCP connection remain incomplete. Evidence:
`reports/ai-visibility-2026-10-28/comparison-v2/public-preparation/portal-draft-2026-11-01.json`
in the parent workspace; portal screenshot is saved in plugin-public-path.

### 2026-11-01: private deployment and public connection blocker

- Owner authorized necessary private deployments, full-flow tests and a demo, but no submission.
- Sites deployment appgdep_6ae70179f6a08191b99a83e6cd038e65 succeeded from b8b90fca29a0629ef41f0f26fccfab5b742d2bf8. Audience unchanged.
- Ownership token is correct for signed-in Chrome. Anonymous IAB sees Sites login; the portal remains Domain not verified and Authorization unavailable. No bypass or audience change attempted.
- Real installed private tool, one photo: handoff opened current production AutoLister editor with matching photo/title/description and Saved status. Desktop and 390x844 mobile evidence saved under plugin-public-path. No saved note enabled in this run.
- Local receiver account-switch protection and additive policy pages remain undeployed. This test does not validate those changes or the separate portal App.
- Full ChatGPT-host demo video remains incomplete. Available browser capture capability is screenshots only. Do not substitute a screenshot montage as a recording.
- Public submission blocked pending supported Sites verification/OAuth route. See docs/plugin-submission/sites-public-route.md for exact identities and evidence.

### 2026-11-02: first-use friction, local only

- Fixed mobile navigation sending the main start action to the Chrome Store.
  Web app is primary; extension installation stays separate. Checked all eight
  locales with their existing click tracking.
- Retain unfinished model choices across dialog/settings close and reopen in
  the current account session. Sign-out clears them. Creation stays explicit.
- Browser QA exposed and fixed Back to settings also closing the settings panel.
- Inspected real local first-item screens, guest skip and preferences through
  fixture sign-in, and the optional invitation. No new onboarding copy or prompts.
- Fixed a narrow-screen pricing badge overflow and made short mobile menus
  scrollable. Localized the previously English lifetime quota label without
  changing the allowance. See `docs/first-use-friction-review.md` for evidence and scope.
- No live signup, generation or conversion claim. No spend, email or publication.
  The model-content publication hold remains in place.
- Final evidence: website production gate passed (1,382 tests); six built-page
  first-use browser cases passed. Extension verification totals 168 unit and
  382 browser passes, 13 browser skips. Corrected a stale sibling-backend fixture
  path and reran all 25 coordinated cases successfully. No unresolved test failure.

### 2026-11-02: model-photo release authorized

- Owner authorized publication after extension 1.4.30 became publicly available.
  Google's public update service independently confirmed that package version.
- Fresh enabled website gate passed: 1,382 tests. All six built-page first-use
  browser checks passed again with the model content enabled.
- Release scope, deployment checks, rollback and final evidence location are in
  `docs/model-photo-release-20261102.md`. Earlier publication-hold notes are historical.
- No new extension upload, customer message, paid test or advertising spend.
  Live signup and conversion outcomes remain untested by this release QA.

### 2026-11-02: homepage model-photo carousel

- Added the owner's exact beige-dress comparison as the first of five slides in
  the shared homepage carousel. Both experiment variants retain the other four.
- Matched the existing 8:5 cards, brand/headline scale, text alignment and purple
  treatment. Added the localized New badge outside the comparison image.
- Independent review requested by the owner accepted the benefit-led headline,
  brief reuse explanation, desktop/phone renders and all eight translations.
  Portuguese was shortened for consistent sizing on narrow phones.
- Responsive WebP thumbnails are 22 to 50 KB. Image selection reflects the
  actual comparison width. Zoom retains the original, pixel-identical comparison.
- Narrow-phone QA also found two pre-existing Dutch heading overflows. Allow
  wrapping and constrain the final CTA text column without changing its copy.
- Final geometry, carousel, zoom, keyboard and release evidence is retained in
  the owner's `model-carousel-20261102` visualization folder. No spend or outreach.

### 2026-11-02: natural Dutch heading wrapping

- Replaced the two long compound-word headings with natural Dutch:
  "AI-assistent voor je advertenties" and "Klaar voor je volgende advertentie?"
- Removed arbitrary word breaking for these Dutch headings. Balance the lines
  and keep AI-assistent together at its existing font size. Other locales retain
  their existing treatment.
- Verified 24 heading cases across six widths, 320 to 1440 px, and both homepage
  variants. Check actual word boundaries, not just page overflow. Evidence is in
  the owner's `dutch-heading-wrap-20261102` visualization folder.

### 2026-11-03: US homepage compatibility copy (local draft)

- Reuse the English homepage source to build the US output. A Vercel country
  rewrite selects it at `/`, retaining query parameters and the existing A/B
  assignment. No runtime location API, extra JavaScript or server function.
- US copy: "Compatible with Vinted, Depop, Poshmark and eBay\*." The footer
  states that Depop, Poshmark and eBay have limited access. Other visitors and
  localized routes keep their existing wording. Internal output is excluded
  from the sitemap and canonicalizes to `/`.
- Local built-output checks cover US, France and absent country signals,
  both existing A/B assignments, and 320/390/1440px widths: 18 cases pass.
  Confirm visible text, footer, retained URL/assignment, layout stability,
  no horizontal overflow or JavaScript errors. Built HTML is identical after
  substituting only the requested compatibility and footer text.
- Lint, type checking, build and formatting pass. Initial full-suite run hit
  a 5-second timeout in `inputPhotoReview.postgres.test.ts`; it passed alone
  and the full rerun with four workers passes (1531 tests, 20 opt-in skips).
- Desktop before/after and mobile A/B renders are saved in the owner's
  `01a1a0b0-4038-7423-a16d-f049c5ccc65b` visualization folder. CDN header matching
  is simulated locally; real Vercel routing remains untested until an approved
  deployment. No publication, spend, customer signup or marketplace action.

- Approved deployment on November 3. Initial live US retrieval exposed Vercel
  filesystem precedence: `index.html` bypassed the conditional rewrite. Move
  only the built default HTML into `home-default/index.html`, then use the
  existing US rule plus a default fallback. Keep the shared source and dev
  homepage intact. Added a regression check against actual built output and
  filesystem precedence. Live verification remains active until rechecked.

## Vinted seller articles QA - 2026-11-04

- Updated the four localized seller stories and prepared four localized selling guides. Native listing crops omit the seller account name; source originals and provenance are retained privately in the case-study report directory.
- Local build and blog-plan check passed. Browser checks covered eight pages at 390px and 1440px, including canonical and language links, internal article links, image loading and horizontal overflow. English, French, German and Dutch mobile examples and English desktop examples were visually inspected.
- Production web entry /app?ref=blog_sell_faster returned 200 and displayed the listing-style flow on mobile. The Chrome Web Store destination and Vinted guidance returned 200. Signup, generation, model-photo charges and a complete first-value journey were not tested. No new account or Vinted listing was created.
- Local full production verification passed: 181 test files, 1,534 tests; 4 files and 22 tests skipped. Search indexing and acquisition outcomes remain to be measured after release.

## Seller story balance screenshot - 2026-11-04

- Added the seller-provided balance screenshot to the start of the four localized case studies. The available and pending figures retain their original labels; the account name is not shown.
- Cropped source is retained with the private case-study evidence. Rendered desktop and mobile placements passed in all four languages; the case-study links are unchanged from the previous live check.

## First subscription purchase measurement and paused Search test, 2026-11-06

- Owner approved deploying tracking only. Ads must remain paused, with no spend.
- Add consent-gated Google Ads conversion `AutoLister first paid subscription`,
  `AW-18434567859/TMdVCLelxLMdELPdpNZE`. Primary, variable EUR value, count one,
  stable invoice ID for deduplication. Enhanced conversions and personalization
  are off. Purchase is campaign-specific, not an account-default goal.
- Server verifies a live paid completed subscription Checkout Session, matching
  paid initial invoice, fulfilled profile and no earlier positive paid subscription
  history across Stripe invoices or this profile's billing events. Tracking errors
  fail closed without changing entitlements. Renewals, credit packs and test
  sessions do not count. Invoice value is actual first payment, not predicted LTV.
- Browser measurement requires permission and a return from Checkout. Rejection,
  blockers, or never returning can cause undercounting. No real purchase or live
  conversion was manufactured for QA. End-to-end Google receipt is not verified.
- Local production gate passes: 184 suites, 1,575 tests; 22 opt-in tests skipped.
  Desktop 1280px and phone 390px built-page renders checked for consent/disclosure.
  Reject and privacy navigation work. Local app entry is disabled by its build
  configuration, so signup and first generation are not validated locally.
- Existing campaign 24222309107 renamed `AutoLister | UK | Description Search | Nov 2026`
  and explicitly paused. Campaign total EUR52.50 includes EUR2.50 historical spend:
  EUR50 additional ad spend remains. End November 21; revisit if launch is delayed.
  Maximize clicks, CPC ceiling EUR0.75. UK presence targeting; Search partners and
  Display off. AI Max, automatic asset creation, text customization and URL
  expansion off. Original English language configuration retained.
- Enabled exact keywords: [vinted description generator], [vinted listing tool].
  Paused the three AI/agent keywords. Added 11 phrase negatives covering customer
  support, parcel/shipping enquiries, jobs/careers and buying bots. Campaign and
  new ad URL suffixes identify description_search_uk_nov2026.
- New responsive Search ad submitted through Save ad; table count rose from two
  to three. Eight headlines and three descriptions, five free drafts, browser
  access, review/edit/copy claims. Final URL /vinted-description-generator.
  Removed the old iPhone/Orion setup sitelink from the new ad form.
- Launch blockers: ad blocker hides the ad table and actual previews. User asked
  to disable it for ads.google.com; browser security policy disallowed agent
  extension-settings changes. Final saved-ad readback, pausing the old ad,
  inherited asset review, and desktop/phone Google previews remain outstanding.
  Do not launch until these checks and the real signup-to-first-draft path pass.
- Proposed practical seller check: girlfriend tries one real item from the exact
  landing page on her phone without coaching, notes confusion and draft edits.
  Do not buy, post to Vinted, email dormant subscribers, or claim this is proof of
  willingness to pay. Review search intent/activation at EUR25 additional spend,
  assess paid acquisitions at EUR50 after conversion lag. No automatic scaling.

### 2026-11-06: saved ad readback after blocker change

- Ads table now renders. Confirmed responsive search ad `830674223022`, landing URL `/vinted-description-generator`, display paths `vinted/descriptions`, and the intended campaign/creative UTM suffix.
- Paused superseded ad `823641484551`; verified the row reads Paused. Campaign `24222309107` remains paused; no spend enabled. New ad remains pending review.
- Desktop preview rendered one combination with relevant listing/photo checklist and plans sitelinks. Mobile previews remained blank on repeated checks, so full placement verification remains incomplete. Do not activate yet.
- Proposed additional test budget remains EUR 50, within the saved EUR 52.50 campaign total including EUR 2.50 already spent.

### 2026-11-07: local homepage acquisition recovery draft

- Local branch `codex/homepage-search-recovery`, based on `794f868`. No publication, spending or messages.
- Restore explicit Vinted listing intent to English and German search titles, descriptions and hero headlines. Remove repeated hero bullets and place a short independence statement under the offer; retain the full footer disclaimer. Preserve US positioning, other locales, destinations and experiment behavior.
- Acquisition evidence: Stripe new subscribers July 20, August 16, September 13. Search Console English/German homepage clicks 1,432 before the August 7 changes, 610 immediately after, 583 in the latest equal 28-day window. Clearest daily traffic break August 8-10. Signup-cohort first-week positive payment incidence rises from 8.9% in August to 12.7% in September while signup volume falls. These support prioritizing acquisition; parallel weekly series do not establish individual attribution.
- Evidence and raw exports: parent workspace `reports/paying-decline-2026-11-07/`. Review document and desktop/mobile before/after renders: `C:/Users/Sami/.codex/visualizations/2026/11/07/01a1b627-f2a6-7c82-a3be-5c2c8586b98b/homepage-recovery/review.html`.
- Validation: type-check and production build passed; 31 targeted tests passed across homepage copy/performance, country routing, experiment, localization, tier proof and sitemap. Actual built English/German pages inspected at 1440px and 390px. Local public usage counter has no production data. No live signup, payment or marketplace flow performed; whole acquisition journey is not claimed verified.
- Review locally now. Any production release needs owner approval and must respect the existing experiment follow-up through November 9. After recrawl, compare four complete weeks by page/query/country/device and track new subscribers and matched signup-cohort activation/payment separately.

### 2026-11-07: expanded recovery draft and CTA history

- Owner requested all affected languages and a clearer CTA/video hierarchy. Expanded the local SEO and hero copy to French, Dutch, Polish, Spanish, Italian and Portuguese alongside English/German. US copy keeps its broader marketplace positioning; shared layout/navigation improvements also apply there.
- CTA history: August 4 `49e6cb0` changed the lower pricing-rail label from See plan to Try first for free, retaining the pricing destination. August 13 `36c4399` removed fixed rail positioning. October 12 `7f13989` introduced the primary web-app draft route and secondary extension route. The October route change cannot explain the August break. No matched historical CTA conversion series establishes the August label as a cause. Search exposure loss remains the stronger measured acquisition problem.
- Local hierarchy: offer, primary action, demo, model-photo promotion. The hero and homepage navigation now name the draft action and consistently enter the web app; desktop extension installation remains secondary. Demo width is capped at 560px on desktop and 300px on small phones, with fullscreen retained. Removed the inaccurate 15-second caption from the 59-second video. Retained necessary route distinctions and omitted repeated benefit bullets from the eight revised homepages.
- Validation: production build and type-check pass, 31 targeted tests pass. Forty actual rendered checks across all eight locales at 320/390/768/1024/1440px found no horizontal overflow. Tablet/laptop checks found no header/headline overlap. At 320x568 every primary action ends by pixel 436. Inspected localized desktop/mobile sheets plus the US variant; saved exact hrefs and geometry in `all-locales/layout-checks.json` beside the earlier review.
- The primary click reaches `/app/?ref=home_hero`; this local build displays Mobile web app unavailable because its app feature flag is disabled. Signup, generation and payment are untested here. No claim of complete acquisition-path verification or conversion uplift.
- Current review supersedes the earlier English/German draft: `C:/Users/Sami/.codex/visualizations/2026/11/07/01a1b627-f2a6-7c82-a3be-5c2c8586b98b/homepage-recovery/all-locales/review.html`. Source stays local. Existing experiment configuration remains untouched, but this hierarchy must not be published into its remaining follow-up window. Export results and wait until November 9 before any approved release. Hero tracking identifies `acquisition_recovery_v2` for subsequent analysis.

### 2026-11-07: final essentials and alignment audit

- Repaired three content risks: English title favored generator wording over the stronger listing-agent query family; removed bullets also removed visible hashtags; the header no longer communicated the free start. English title now uses AI Listing Agent for Vinted; the feature heading retains description-generator intent. All eight localized heroes explicitly include AI, titles, descriptions and hashtags, plus item batching and seller notes. Primary actions explicitly offer a free draft, consistent with the existing five-generation allowance. No pricing or allowance changed.
- Property-level query-family counts: nine listing-agent queries, 183 to 127 clicks; three description-generator queries, 12 to 7. These are not homepage-filtered or individual-payer attribution. Reviewed Google Search Central title-link and localized-version guidance; preserve natural wording instead of exact-match repetition.
- Aligned desktop video and gallery edges at a shared 560px maximum width. Rechecked eight locales at five widths: 40 passes, one H1 each, self-canonicals, nine reciprocal language annotations, no overflow/header overlap, and small-phone CTA bottoms below pixel 468. Portuguese hero matches the informal address of the model section. US retains marketplace wording and receives the shared free CTA and layout.
- Type-check, build and 31 relevant tests passed. Current audit: `all-locales/final-seo-layout-audit.json`; updated desktop/mobile sheets and feature-section captures are in the review. Local-only; prior signup/payment verification and release limits remain.

### 2026-11-07: independent review and HTML validation

- Owner requested independent review. Reviewer found two material issues, both corrected and re-reviewed: US overrides on the shared canonical URL omitted the recovery title/headline; desktop how-it-works and final CTA contradicted the web-first hero. US now inherits English title, description and H1 while retaining compatibility copy. All locales use web-draft instructions and final primary CTA; desktop extension installation is explicitly secondary.
- Nu HTML Checker 26.11.4 validated nine built homepage variants with zero errors or warnings. Corrected invalid div children inside language buttons, generic-element aria-label and missing preview-image src. All 396 internal link occurrences resolve locally; 27 JSON-LD blocks parse. This does not establish rich-result eligibility.
- Build, type-check and 32 targeted tests pass. Added country-variant metadata/H1 parity coverage. Reviewer confirmed both fixes and found no further material source issues. Desktop and mobile final CTA captures cover all nine variants; updated US hero and English desktop steps are included in the local review.
- Data interpretation: 20 to 16 to 13 monthly new subscribers is an observed loss, not seven buyers attributable to titles. August 12/135 and September 13/102 first-week payer rates have overlapping Wilson 95% intervals (5.2-14.9% and 7.6-20.6%). Lost homepage search exposure and smaller signup cohorts support acquisition as the first priority; they do not prove checkout healthy.
- Validator/link evidence: parent workspace `reports/paying-decline-2026-11-07/html-review/`. Review remains `all-locales/review.html` at the artifact path above. Local draft only; app-path and production-release limitations remain unchanged.
