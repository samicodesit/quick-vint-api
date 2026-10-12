# Public web beta implementation plan

> Implement inline with superpowers:executing-plans. One independent reviewer checks the completed branch, as explicitly requested by the user.

**Goal:** Publish the local-draft web app with a compact dual-route homepage and a truthful overview in the existing admin.

**Architecture:** Keep Astro server-rendered landing markup and the existing demo. Reuse the durable website event queue, authenticated generation logs, existing profiles and admin authorization. Draft photos and text stay local; no new database or dependency.

**Tech stack:** Astro, TypeScript, Supabase, existing telemetry queue, Vitest and Playwright.

**Spec:** User-approved compact counter in the header, visible demo, Create a draft and Install AutoLister actions, unchanged headline and compatibility wording, existing product limits, public /app and /beta access, and integrated admin tracking.

## Global constraints

- No new draft tables, quotas, pricing or extension release.
- Preserve the latest main model pilot and unrelated changes.
- Use a neutral phone icon; retain the current trademark compatibility and non-affiliation copy.
- No generated content, photo URLs, filenames or tokens in business telemetry.
- Production release uses the existing main-branch verification and push command.
- No live marketplace listing, customer account, purchase or paid generation for QA.

## Review focus

- 360px and long translations must not overflow; counter updates must not alter header height.
- Anonymous visits, existing sign-ins and new signups must be distinguishable without invented conversion claims.
- Retried telemetry and recovered generations must not inflate counts.
- Internal QA, extension events and missing/truncated data must not mislead the web overview.
- Public auth callback, protected admin and disabled cloud draft routes must retain their boundaries.

### Task 1: Compact homepage

Files: HomeLanding.astro, SiteLayout.astro, homepage tests, a responsive browser check.

- [ ] Add failing browser assertions for demo and both routes above the fold at 390x844, stable borderless counter, no overflow at 360/390/768/1024/1440 and French/German text.
- [ ] Implement static responsive ordering, compact actions and localized short helpers without changing SEO copy.
- [ ] Verify demo playback/fullscreen, menu, support and exact app/extension destinations in a rendered browser.

### Task 2: Web events and admin overview

Files: mobile-web analytics/app, shared web analytics context, incident registry/policy, events ingestion, generation metadata, utils/webAppStats.ts, admin API/UI and endpoint tests.

- [ ] Add endpoint tests for verified identities, anonymous sessions, internal exclusions, existing sign-ins, mixed clients, retry deduplication, failures and unavailable/truncated data.
- [ ] Reuse the existing durable queue and add only bounded session and event metadata. Record web generation client/request ID in already-redacted API logs.
- [ ] Add authorized web-app-stats and /admin/web-app using existing logs/profiles. Separate visits, signed-in users, new signups, successful generations, copies, returning generators and checkout interest from current paid users.
- [ ] Verify actual browser delivery across a failed response and reload, plus admin rendering and endpoint contracts.

### Task 3: Review and release

- [ ] Run local draft/settings browser journeys and the complete production gate including actual generation HTTP/browser integration tests.
- [ ] Run one independent read-only review, fix material findings and rerun affected checks.
- [ ] Enable only production web flags and the exact production auth callback; keep cloud draft APIs disabled and private preview protection intact.
- [ ] Merge through the clean main release checkout and use npm run push:production.
- [ ] Verify ready source SHA, homepage CTA, /beta redirect, public /app auth, admin guard and live telemetry ingestion. Open the public beta and admin overview.

## Search Console evidence

On 2026-10-12, Search Console Web search, exact homepage https://autolister.app/, 28-day report (2026-09-12 through 2026-10-09): 1,019 clicks, 7,997 impressions, 12.7% CTR, average position 4. Leading queries: ai listing agent for vinted (246 clicks), vinted ai listing agent (110), autolister ai (68), ai vinted listing agent (62), ai listing agent vinted (38). Preserve the relevant existing headline and compatibility phrase. This query evidence does not establish either route's conversion rate.
