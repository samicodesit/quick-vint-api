# Web batch review implementation plan

**Goal:** Let web app sellers review ready items during generation through clear actions and compact persistent progress, without automatic navigation or extension changes.

**Architecture:** Reuse the existing browser draft queue, editor, item settings and one progress panel. Move that panel into an editor slot during review so it cannot overlap the fixed item footer. This increment does not provide server-owned background execution.

**Scope:** Only `src/app/mobile-web/draftWorkspace.ts`, `src/components/mobile-web/DraftWorkspace.astro`, `src/styles/listing-drafts.css`, focused browser verification and review documentation. Preserve shared generation, billing, auth, upload APIs, local photo storage and the entire extension checkout.

## Acceptance

- [x] Add a failing real-browser regression: two grouped items, hold model responses, first ready row has Review rather than settings, opening it preserves the active second item and exposes non-overlapping progress.
- [x] Implement clear Review/Open actions on ready/failed rows, keep settings on ungenerated rows and inside the editor.
- [x] Keep one compact progress panel above the reviewed item's content, with counts and the truthful foreground-processing requirement. Do not automatically open another item.
- [x] Hide completed grouping instructions once generation starts; preserve photo entry and grouping before it starts.
- [x] Restrict batch Next navigation to ready items. Never treat Copy as publishing. Preserve seller edits and exact photos when later items finish.
- [x] Repeat lifecycle/timing browser cases three times, verify mobile/tablet/desktop bounds and normal single-item behavior, then run the existing full browser journey and production verification gates.
- [x] Manually operate a pictured batch from grouping through first-ready review, ongoing progress, editing/copying, later completion and explicit navigation. Inspect each screenshot and update the phone-accessible review.
- [x] Compare extension source fingerprints before and after; no product extension changes are permitted in this increment.

## Acceptance evidence

The expanded focused journey passed three consecutive two-item runs and one 20-item run. It includes real image preparation, IndexedDB, clipboard, exact photo retention, preserved edits, explicit Next ready, Mark as listed retaining Back to batch, new single-item generation entry, and header/progress/footer geometry at 320/390/768/1440px. The existing full browser suite passed 24 checks with zero page errors. Final production verification passed lint, types, build, formatting and 994 tests (four opt-in tests skipped).

Manual visual checks found and corrected stale completed progress hiding a new single item's Generate action, loss of the batch return route after Mark as listed, overlapping header controls at 320px and scrolled progress hidden behind the sticky header. Fifteen screenshot steps are saved in the frontend review folder `docs/reviews/2026-10-16-web-batch-v2/`. Source fingerprint checks for background.js, content.js and manifest.json all match the pre-adjustment candidate. No deployment occurred.

Auth, remote storage and AI were controlled. Native iOS suspension/keyboard behavior, live provider service and Vinted publication are untested. Browser-only progress is not a durable server batch runner and does not establish historical recovery.

## Durable background processing follow-up

The existing browser loop starts each next item; `generation-result` recovers only an already-started item. No existing durable batch runner was found. A server-owned job needs persistent batch/item state, confirmed temporary photo availability, leases/recovery after worker interruption, account-scoped cancellation and the existing entitlement/idempotency contracts. Do not claim that `waitUntil`, a progress display or browser visibility handling makes a durable queue. Do not introduce a new migration or service under the earlier monitoring authorization. Prepare a concrete proposal for that separate backend increment.
