# Mobile homepage test implementation plan

> Execute inline with superpowers:executing-plans. The user approved a 50/50 phone test. Do not delegate.

**Goal:** Compare the accepted demo-first A with app-first B using verified draft outcomes and existing infrastructure.

**Architecture:** A tiny synchronous inline assignment runs before paint only on localized homepages. Existing durable events carry assignment and browser IDs. Existing API generation records carry the same pseudonymous browser ID. The existing admin web-app query computes the cohort; no new table, service, polling, photo copies or billing changes.

**Tech stack:** Astro, TypeScript, existing durable telemetry, existing Supabase api_logs, Vitest/PGlite and Chromium.

**Spec:** docs/qa/homepage-mobile-experiment-20261012.md and the accepted in-chat A/B preview. Keep Assistant identical in both arms.

## Constraints

- Phone viewport below 768px. Desktop unchanged. Stable 50/50 cryptographic browser assignment, fail to A when storage is unavailable.
- Preserve headline, metadata, canonical/hreflang, compatibility wording, counter and full video. Existing localized copy stays intact; new device labels and common mobile-only access instructions are translated in eight locales.
- No network tracking waits on navigation/generation/billing. The existing local entry-click write is capped at 16ms rather than 150ms. A native browser test reproduced lost clicks when the local commit was removed entirely. One queued exposure per observed browser, bounded existing events thereafter.
- Primary: authenticated API success within seven days of observed exposure, deduplicated by browser and request ID. Client success claims are not primary evidence. Report mature cohorts separately, no automatic winner.
- Fit existing 30-day metric retention: enroll for 21 days from October 12, then allow seven days for outcomes. Ends November 9 UTC. Existing assignment stays until end, then the experiment defaults to A. Export final aggregate results before cleanup; do not expand retention.
- Existing cleanup must retain only tiny experiment/count/business fields, while photo/text/other heavy evidence still expires at six hours. Update the existing restricted compaction function, with no new table or grant.

## Tasks

- [x] Assignment and UI: fail-first stable allocation/denied storage/expiry tests, before-paint native browser checks, exact A/B phone layout and unchanged desktop, all localized route labels. Files: src/scripts/homepageExperiment.ts, SiteLayout.astro, HomeLanding.astro, webEntry.ts, webAnalyticsContext.ts, analytics.js.
- [x] Metrics: fail-first cohort tests for forged client successes, cross-browser accounts, lost-response retries, internal users, date bounds and seven-day maturity. Wire an aggregate A/B table into the existing web-app admin report. Files: utils/homepageExperimentStats.ts, utils/webAppStats.ts, admin.html, generationClient.ts, generate.ts, context-policy/registry.
- [x] Cleanup: real SQL tests preserve compact exposure/outcome fields and discard private photos/text at six hours and metric metadata after 30 days. Update the existing function safely, retaining service-role-only access.
- [ ] Release: actual Chromium phone flow for both stable variants and exposure-to-auth-to-generate/copy attribution, offline/storage failure, layout/scroll/video/overlay checks. Full guarded production gate. Apply the tested restricted cleanup function, push main, wait for READY, inspect deployed assets/admin report and record remaining uncertainty.
