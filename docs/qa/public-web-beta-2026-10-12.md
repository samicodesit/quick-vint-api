# Public web beta release checks

## Scope

Compact borderless counter in the homepage header; real demo above both entry routes on mobile; unchanged headline, metadata and compatibility wording. Public `/app`, with `/beta` forwarding to it. Local draft storage and existing authenticated generation/upload/billing services remain. No cloud draft tables, quota changes, pricing changes or extension release.

## Observed checks

- Complete production gate passed: lint, TypeScript, Astro build, formatting and 875 tests across 123 files. `RUN_GENERATION_BROWSER_TESTS=1` ran three real HTTP/browser concurrency, account-isolation and socket/commit-loss tests, including a negative control for broken retry IDs.
- Rendered landing checks passed at 360x800, 390x844, 768x1024, 1024x900 and 1440x1000, plus French and German at 390x844. Both routes are above the fold in the English phone checks; no horizontal overflow, counter changes preserve header geometry, and the real video enters/exits fullscreen.
- Existing local draft browser journey passed all 16 checks: ten local JPEGs, long editable descriptions, stable action bar, offline saving/reload, selected-photo deletion, grouping, sequential generation, quota denial, dropdown/sheet behavior and read-only recovery after response loss.
- Existing settings discovery browser suite passed all five scenarios, including account isolation, plan locks, opt-outs and reduced motion.
- Browser telemetry check used the actual durable IndexedDB transport: homepage click survives navigation, anonymous app view persists, a lost response is retried after reload with the same UUID, session IDs survive reload and authenticated events use bearer ownership. No email/token enters event payloads.
- Rendered admin checks passed at 390px and 1440px: metrics, 7/30-day selection, request authorization, no horizontal page overflow and an outage state without fabricated zero cards.
- Actual embedded PostgreSQL tests prove event receipt deduplication, anonymous versus verified ownership, checkout retention without a false running incident, compaction privacy, metric expiry and denied anonymous RPC execution.

## Review

One independent read-only reviewer identified checkout starts not being retained. The explicit mobile business-log retention path and PostgreSQL regression fixture resolve it without changing incident checkpoint classification. The same reviewer confirmed the fix and no remaining release blocker. Anonymous visits are explicitly client-reported directional metrics; successful generation counts use verified server outcomes and stable request IDs. Current paid entitlement is separate from new payments or revenue.

## Configuration

The additive service-only compaction function was applied before release. A live privilege query confirms anon=false, authenticated=false and service_role=true. It keeps only bounded web metric metadata for 30 days; heavy generation evidence follows the existing six-hour cleanup. No new table or public function access.

Production public web flags and validated public anon config are set. Cloud draft APIs remain disabled. Both exact production app callbacks were added while preserving existing auth redirects and the site URL. Private Vercel preview protection remains in place.

## Search evidence and limits

Search Console Web search, exact homepage, September 12 through October 9: 1,019 clicks and 7,997 impressions. The leading queries concern AI listing agents and the AutoLister brand. Existing headline/compatibility copy is retained; neither route's conversion rate is established yet.

## Live acceptance

- Final guarded main push passed all 876 tests in 123 files. Production deployment `dpl_92TBFsmGDTYVTPpxHdFLoY5HxpMx` is READY on source `e62b5a553fb12b60d7a84dc56d26ac15be838af2`, with `autolister.app` assigned. The final copy-scope adjustment was checked by the same independent reviewer.
- `/beta` reaches the public `/app` with no preview banner and `noindex, nofollow`. The exact homepage Create a draft link opens it. The real mobile header displays the live 11,733+ counter without a badge or extra row; the existing demo and both actions remain visible.
- Existing owner Google sign-in completed through the production callback and opened the real local draft workspace. Existing plan/usage loaded. No new account, generation, email, purchase or marketplace listing was used.
- The real authenticated admin view and API load. An unauthenticated admin request returns 401. Live business telemetry appears in the overview: one anonymous QA browser visit and two observed homepage QA clicks. These are release checks, not customer acquisition. Internal owner sign-ins do not inflate user/activation figures.
- Cloud `/api/drafts` returns 404 with `drafts_disabled`. The service-only compaction RPC accepts an empty batch and changes zero rows. Existing private-preview protection and other callbacks remain intact.
- Beta and admin tabs are left open. Final mobile and admin screenshots are saved as local QA evidence. Earlier preview drafts remain at the original preview origin; opening the public origin does not migrate or delete them.

Physical-phone browsers, a new live signup, new paid conversion and production generation were not exercised. Real generation behavior and retry recovery were tested locally through rendered browsers, HTTP endpoints and PostgreSQL. Conversion performance is still unmeasured.

## Header logo correction

The web app logo now targets `/app` and returns to the Drafts library inside the current document. It shares the existing library-tab navigation, flushes pending edits and preserves background work. Modified clicks retain normal link behavior. The rendered browser regression first failed on the old `/` target, then passed an immediate edit followed by a logo click, confirming saved text and the same document before reload. The complete 17-step local draft journey and the production gate (876 tests, including real generation HTTP checks) passed.
