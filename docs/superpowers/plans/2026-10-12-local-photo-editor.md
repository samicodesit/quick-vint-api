# Local photo editor implementation plan

**Goal:** Add the approved compact crop, rotate/straighten, Reset and Save editor inside each draft's existing photo menu.

**Approach:** Lazy-load pinned Cropper.js and our own native dialog only when Edit photo is clicked. Preserve the first saved JPEG in the existing local blob row. Replace only the selected photo atomically, update generation input version and reject stale, moved, deleted or generating photos. No backend, entitlement or extension changes.

**Constraints:** Existing AutoLister fonts/colors/icons and touch targets. No install prompt or new global controls. No initial editor download. Keep originals available for restore; account for their bytes in the existing storage cap. Export from the source pixel scale, not the screen thumbnail. Closing restores focus/scroll immediately and discards unsaved changes. Physical phone tests are reported separately from touch-browser checks. Work inline; no delegation.

- [x] Add failing local-storage cases for original preservation, edit/restore, concurrency, busy/deleted/moved photos, storage capacity and object-URL refresh across store connections.
- [x] Implement the small local store/client edit interface, preserving existing account ownership, draft text, photo order and generation fencing.
- [x] Add failing rendered browser checks for lazy loading, correct selected photo, full-size JPEG output, Cropper pointer/touch interaction, rotation, reset/cancel, reload/generation using edited bytes and fast repeated dismissal.
- [x] Implement the editor module and scoped styling; integrate it through the existing menu. Keep expensive work and dependency import out of first load.
- [x] Run actual browser QA at 320/390/768/1440px and inspect phone/desktop screenshots; measure the built lazy chunk. Run the full required production gate, preserve concurrent production changes, guarded push and READY/live acceptance if checks pass.

Acceptance: production commit `cc66fe5`, full gate passed 955 tests in 129 files, guarded `main -> main` push. Vercel deployment `EYNpybch2pMmfigDhZch2e31HxaW` reached READY. The actual deployed `/app/` passed all 23 Chromium journey checks with auth/API/provider/billing intercepted. See [QA evidence and limits](../../qa/local-photo-editor-20261012.md).
