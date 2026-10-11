# Local draft storage acceptance

October 11, 2026. Replaces the cloud-draft storage requirement for the MVP.

Final local checks: lint, types, the feature-enabled 132-page build and formatting
pass. The unit suite passes 118 files / 846 tests. The browser journey passes
16 checks with zero page errors and zero cloud draft/photo API calls.
[Browser result](local-storage/result.json), [local-save library](local-storage/library-390.png).

Implemented account-scoped IndexedDB for prepared JPEGs and draft metadata.
Single and batch generation reuse existing temporary uploads and quota controls.
No cloud draft-list, save or permanent photo-upload request is made by the UI.
Read-only result recovery uses mobile retry records, without another AI call.

The deterministic browser journey uses real IndexedDB and intercepted upload,
generation and usage responses. It covers ten photos, matching mobile CTA geometry,
long text, reload persistence, offline saving, whole-card selection, correct photo
deletion previews, grouping, per-item settings without leaving the batch,
sequential generation, quota blocking, Listed state, and selected-item deletion.
Menus, account dismissal, logo visibility and horizontal bounds are checked at
360, 390, 768 and 1440 CSS pixels. No live accounts, provider calls or charges.

Unit checks include transaction rollback on quota errors, two-tab save and claim
conflicts, account isolation, removal of image blobs/URLs, unavailable browser
storage, complete generation settings, account changes during auth refresh, lost
response recovery, and retrying a successful result's failed local save.
Indexed reads page the library and target individual items without loading every
draft's text. Index upgrades preserve earlier local JPEGs and metadata.

The mobile retry migration still needs its deployment state confirmed. It is in
the feature branch, not the checked-out main. No production migration or deploy
was performed. Physical Safari/Chrome devices, live auth, deployed Storage and
provider integration remain unverified. Browser data can be cleared or evicted;
there is no cross-device draft sync.

The older cloud fixture journey and earlier QA records are historical. Use
`scripts/test-local-browser-drafts.mjs` for the current storage architecture.
