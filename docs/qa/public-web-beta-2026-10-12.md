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

Live rollout still requires a READY deployment with the expected source SHA and final public-route checks. No live customer generation, test purchase, new account, email or marketplace listing was used for these checks. Physical-phone browsers and paid conversion are not claimed verified.
