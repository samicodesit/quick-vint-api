# Listing model photos implementation

Local implementation on `codex/user-model`, not deployed. `LISTING_MODEL_PHOTOS_ENABLED` defaults to false and also requires the existing saved-model flag. Apply `2026-11-01_listing_model_photos.sql` after the saved-model migration before enabling it.

## Behavior

- New single listings and editable batch generation receive independent photo jobs. Existing text prompts remain unchanged. Text is editable while eligible photos process.
- Existing Vinted `/items/:id/edit` pages have an explicit **Add model photos** action inside Your model. It does not rewrite text, save or publish. A new photos-only job reserves one existing listing allowance; an ineligible item returns it. Identical source/model jobs reuse their outputs. Upload retries do not call an image provider.
- Published wardrobe text rewrites remain text-only. Opening a draft, viewing model settings, or enabling the feature does not modify listing photos.
- The model shortcut sits beside on-page settings, with a preview/setup button and an inline enable switch. Its sole New badge disappears after interaction. Generate remains the primary action; language selectors stay beside their respective field labels. Shared assets use existing bundled typography and localized copy in all 17 supported UI languages.
- Two private outputs precede originals. A quiet classifier excludes unsuitable items and chooses clothing, footwear or bag framing. Front and rear edits run concurrently with immutable pose references. A focused check runs for each result.
- Existing models prepare their rear pose lazily on use. New model creation and explicit enable warm the rear pose. Viewing settings does not start paid work.

## Persistence and safeguards

Durable jobs record ownership, source revision, framing, per-view outputs, leases, retries and provider usage. Two listing jobs can run per account. One explicit retry retains accepted views. Unknown provider outcomes are never automatically repeated.

Sources expire after 24 hours, server outputs after 30 days, and signed URLs after ten minutes. Accepted rear references remain private with their model. Drafts store downloaded blobs locally. Cleanup removes orphaned objects and returns unused photos-only reservations.

Clients and server fence account changes, disabling, source changes and late results. Originals alone feed text, grouping and further image generation. Web drafts allow ten originals plus two generated images within the existing storage limit. Provenance survives editing. Text regeneration does not restore manually removed generated photos.

Extension uploads track files separately, preserve originals and verify retained host ordering. Capacity errors hold the pair. Unsupported sorting requests manual ordering. Navigation and submission stop attachment. During capacity recovery only, removing originals is accepted on explicit retry; adding or changing sources invalidates attachment.

Dispatched uploads retain attribution through cancellation and reload. Original-upload revisions prevent a simultaneous manual original from being mistaken for a generated result. Ambiguous candidates use a conservative local pixel comparison; uncertainty blocks duplicate uploads and source reuse until reconciled. Explicit retries clear failed fingerprint downloads. Client checks repeat after awaited status reads and bind results to the same operation, account, route and source revision.

An explicit new admission can replace a cancelled listing job without discarding its attempt history or reserved unknown spend. Photos-only replacements reserve a fresh allowance. Rear-pose cancellation is recoverable only through the bounded explicit retry path; its durable front reference does not expire with temporary listing sources.

Provider usage, duration, retries and client-reported attachment outcomes are recorded. Image reservations join the existing spending guard. Client reports are observations, not proof of marketplace persistence. Existing text latency monitoring is unchanged. Read-only rollout queries are in `ops/listing-model-photo-monitoring.sql`.

## Verification

- Final API production verification passed lint, types, build, formatting and the full suite: 1,255 tests passed, 13 opt-in tests skipped.
- Extension full `npm test`: 350 E2E passed, 13 opt-in skipped. After the final review fixes, 25 targeted browser tests passed, followed by three dispatched-upload restore/manual-attribution regressions. The current unit suite passed 167 tests and the production build passed. `AUTOLISTER_API_PATH` selected this feature's API worktree.
- Browser coverage includes host-owned ordering with rerenders, partial upload retry, unsupported sorting, photos-only edit with unchanged text, capacity recovery, disable/account/source changes during awaited operations, and model preview/switch synchronization.
- Local web journey verifies editable text during photos, preparation/generation/upload/failure/retry states, atomic ordering, local blob reload, reduced motion and desktop/mobile overflow.
- Earlier local web/fixture screens: workspace `reports/listing-model-photos-20261101`. Final extension desktop/mobile screens come from the local unpacked test build on real Vinted. Cached model settings and earlier generated JPEGs isolate host integration from the provider. No additional paid AI calls were made.
- Real Vinted native upload and pointer sorting passed with one original on desktop and five originals at 390px. Both generated photos stayed first, original order was retained, and adding another original forced a genuine host rerender without losing order. Cached-pair attachment took approximately 3.6 to 4.9 seconds in these runs. Inline enable/disable also passed against cached settings. No listing was saved or published.
- Independent read-only review found and rechecked cancellation, provenance, restore, retry and backend recovery fixes. Final desktop/mobile placements passed visual review. This acceptance does not establish representative garment/anatomy quality or production rollout readiness.

## Release gates and estimates

Follow-up on 2026-11-01: real existing-listing `/edit` attachment also passed with unchanged text/originals, retained host ordering, and discard/reload verification. No save or publish. The expanded garment QA corrected dress layering/accessory copying and a rear bag logo, but the automatic checker still falsely rejects a visibly strapped dress. **Keep the release flag off.** Final local API verification passed 1,255 tests, with 13 opt-in skips. The detailed evidence and budget ledger are in workspace `reports/model-garment-qa-20261101/QA.md` and `ledger.json`. Budget accounted is $2.58573275 of the authorized $3, including $0.04 reserved for unknown classifier usage.

Live Vinted upload and persistent native ordering are verified for the tested create and edit forms. The migration has been exercised in PGlite, not applied to staging or production. Keep the flag off until staging migration, the quality-guard blocker and monitoring are accepted. These checks do not establish exhaustive garment or marketplace coverage.

Previous experiments spent $1.59862125 of $3. Text measured about 2.5 to 3.2 seconds, pair generation 11 to 13 seconds. Estimated readiness is 14 to 18 seconds plus upload, with about 13 seconds extra for an unprepared rear pose. Estimated API cost is $0.08 to $0.09 per eligible listing before retries/storage. These are previous single-listing measurements and estimates, not new production benchmarks or latency ceilings. Deterministic tests and the focused checker do not establish perfect anatomy or garment fidelity.
