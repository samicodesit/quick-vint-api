# AutoLister AI Growth Current Sprint

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
