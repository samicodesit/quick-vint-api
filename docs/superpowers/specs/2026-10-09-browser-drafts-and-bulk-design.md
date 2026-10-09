# Browser drafts and bulk preparation

Status: approved by the user on October 9; implementation authorized through the deployment boundary, with deployment itself excluded.

## Purpose and agreed scope

A seller wants to prepare listings ahead of time without installing an extension or connecting AutoLister to Vinted. They may have photographed a pile of clothes, want to work on several items in one sitting, and need to return later to review and copy their text. The customer email establishes this need; it does not establish that the customer used AutoLister or that AutoLister caused their marketplace suspension.

The user approved continuing from the existing browser app, adding photo grouping, bulk generation and an account-based draft library with editing and copy buttons. They asked for a particularly frictionless UI and UX. This design makes that scope concrete. Account-based saving means drafts and completed uploads follow the signed-in account across devices. This is a design choice based on the approved account-based library, not a claim about existing functionality.

Success: a seller can upload photos, identify which photos belong to each item, generate one or several drafts, leave, return on another device, edit the saved text and copy it. Failed items do not erase successful items. A retry of the same generation does not charge or generate twice. Nothing requires visiting Vinted.

## Existing work and implementation location

- Resume `codex/mobile-web-phase1` at `.worktrees/mobile-web-phase1`; it is already an isolated, clean worktree. The September 23–24 implementation has authentication, quota projection, photo preparation, generation, editable results, clipboard fallback and bearer-owned billing.
- Integrate the current `main` changes before product implementation. At investigation time the histories differ by 26 main-only and 42 mobile-only commits. Resolve overlapping generation, uploads, billing and privacy changes deliberately; do not replace current production files with old branch copies.
- Preserve the existing approved `WorkspaceShell`, photo rail, language/style controls, result fields and blue/navy/white visual system. The separate `design-previews/autolister-pwa-phase1-prototype` is a visual reference, not a production client.
- Use the extension's photo grouping behavior as a reference. Its `content.js` is coupled to Vinted, so do not import its DOM, injection or tab orchestration into the browser app.
- Do not merge `feature/autolister-os-build`. Inventory, tenant workspaces, fact approval, orders, scanning and marketplace adapters are outside this seller's need.
- The old single-item design explicitly excluded saved drafts and bulk generation. This document supersedes those exclusions only for the functionality described here; existing account, billing and extension compatibility requirements still apply.

## Chosen approach and alternatives

Extend the existing authenticated browser app with a private draft library and a sequential generation queue. This reuses the current accounts, image preparation, prompt, parser, quota reservation/refund and generation idempotency.

A browser-only draft store would be smaller but would lose access when a seller changes device or clears browser storage. A merge of the OS project would add unrelated product concepts and different persistence contracts. Neither is the chosen approach.

Do not add a permanent job worker or promise processing after the browser closes. Persist every completed result and enough attempt state to recover an interrupted request. The seller can review drafts while the queue runs, pause after the current item and resume unfinished items later.

## Seller journey

### Arrival and return

Keep the existing Google and email sign-in. Reuse existing accounts and subscriptions; no new signup or marketplace connection step.

After sign-in, an account with no work opens the familiar photo composer. A returning account opens `Your drafts`, with a prominent `New draft` action and a secondary `Prepare several items` action. A completed but ungrouped photo import appears as `Finish grouping photos`, with its thumbnail and photo count.

Use `Drafts` and `Done` views. A newly generated item is a draft, not a published listing. `Mark done` only organizes the library and can be reversed with `Move to drafts`. Copying text does not mark an item done or imply publication.

### One item

The shortest path stays: add photos, optionally change languages/style, generate. Do not require a name, folder, batch setup or an explicit Save click before generation.

Create a private draft and upload prepared photos as the seller adds them. Show local thumbnails immediately, then real per-photo upload progress. The seller may add or remove photos while idle; generation waits until uploads finish. Make the limit and any rejected files clear without silently dropping selection.

Use the generated title as the library label. Before generation, use `Untitled item` with its cover thumbnail; a name field is unnecessary.

### Several items

`Prepare several items` opens a photo import and grouping view. Accept another selection without clearing earlier photos. On desktop support file picking and drag-and-drop; on mobile keep camera and gallery actions visible. Upload in the background with the existing image preparation and at most three concurrent uploads.

Display a photo grid with selectable thumbnails. The instruction is `Select the photos for one item`. The primary action becomes `Create item · N photos` after selection. Creating a group produces a compact item card with a cover, photo count and `Edit photos`; selected thumbnails leave the unassigned grid. Do not guess groups from filenames or image similarity.

Also offer `Each photo is a separate item` as an explicit action for sellers who already have one photo per item. Never apply that interpretation automatically. Allow correction before generation.

Editing a group exposes its photos with accessible `Move to another item`, `Remove from item` and cover selection actions. Moving does not delete a photo. Deleting an item or permanently discarding a photo requires a clearly labelled confirmation; routine grouping does not.

Unassigned photos stay saved and visible. The generation action names exactly how many grouped items it will process. If unassigned photos remain, state that they are excluded and offer `Continue grouping`; do not silently include them or delete them.

Language and description-style defaults apply to the batch. Keep them collapsed into a readable summary; allow per-item overrides in the editor. Do not repeat a settings form on every card.

### Generation and recovery

The primary action is `Generate N drafts`. Show the latest server-reported remaining allowance beside it, with wording that a successful generation uses one allowance unit. Do not calculate a second entitlement model in the browser. If the selected count exceeds the available daily/monthly/lifetime allowance, offer an explicitly smaller run and leave the rest saved. Handle credits using the existing authoritative usage contract.

Process one item at a time. Cards show `Waiting`, `Generating`, `Draft ready`, `Needs attention` or `Paused`. Progress uses real completed counts, such as `3 of 8 drafts ready`; no invented percentage, countdown or processing stage.

Allow opening and editing ready drafts while other items run. `Pause after this item` prevents starting another item; it does not abort an already accepted provider request. Closing the page pauses remaining work. Explain this beside the active queue: `Keep this tab open to finish the remaining items. Saved drafts stay available.`

A bad image or provider failure affects its item. Stop the queue for expired authentication, an uncertain generation commit or an exhausted shared allowance. Respect a server rate-limit reset before resuming; do not hammer the endpoint. Never silently purchase credits, upgrade or regenerate successful drafts.

Persist the operation ID before dispatch. Reopening an interrupted item first checks its existing attempt and recovers any committed result. Do not submit a fresh generation ID simply because the browser lost the response. Present `Check result` while the outcome is uncertain; expose retry only after reconciliation says retry is safe.

An intentional `Regenerate` is a new generation and states that it uses another allowance unit. Preserve the existing text until the replacement is durably saved. Disable photo/settings mutations for the item with an active attempt, while allowing work on other items.

### Review, copy and continue

On desktop use a draft list beside the selected editor. On mobile use full-width cards and a full-width editor with `Back to drafts`, followed by explicit `Previous item` and `Next item` controls. Preserve the list position on return.

Keep photo thumbnails visible with the editable title and description. Use separate `Copy title` and `Copy description` actions, immediate accessible confirmation and the existing manual-selection fallback when clipboard access fails. Do not intercept a normal text selection or move focus unnecessarily.

Autosave edits after a short debounce and on blur. Show `Saving…`, `Saved` or `Not saved — try again` near the editor. Flush pending edits before switching items; a failed save offers retry or staying in the editor. Never show Saved on an optimistic change before server acknowledgement. Warn before closing with unsaved edits and preserve an account-scoped recovery copy in session storage when possible; clear it after acknowledgement or sign-out. Do not promise offline saving or recovery when browser storage is unavailable.

Use version checks for every save. On a cross-device conflict keep the local text and show `This draft changed elsewhere`, with `Load saved version` and `Keep my edits` actions. Keeping edits must rebase on the fetched current version through an explicit user action; never overwrite blindly.

An optional `Open Vinted` action remains secondary. It is an ordinary external link, never auto-opened and never a prerequisite. Do not include auto-fill, extension installation or a marketplace session in this workflow. Explain photo quality accurately: saved previews are prepared/compressed images; sellers should keep original photos for final marketplace uploads.

## Visual and interaction constraints

Use the existing palette: background `#fbfbfe`, surface `#ffffff`, ink `#10165d`, brand `#3048e8`, border `#e6e6f0`, success `#21805b`. Keep the existing Inter family and control scale. Hierarchy comes from real item thumbnails, clear titles and status, not decorative dashboards, statistics or marketing copy.

The signature interaction is the photo group becoming an item card that later becomes an editable draft. Maintain identity through the same cover photo; use a short restrained transition and respect reduced motion.

At 360px and wider, no horizontal page overflow, clipped copy actions or sticky bars covering the final field. Controls remain at least 44px, preferably the existing 48px. Account for safe areas and the on-screen keyboard. Desktop adds the adjacent list rather than stretching mobile fields to the viewport width.

Grouping supports keyboard and pointer selection with actual buttons, visible focus and meaningful selection announcements. Moving photos has button controls, not drag-only behavior. Status is conveyed in text as well as color. Keep dialogs focus-contained with Escape and focus restoration. Destructive dialogs identify the affected item and do not make Enter default to delete.

## Persistence and security

Add a private `listing-drafts` Storage bucket plus two account-owned tables:

- `listing_drafts`: UUID, owner ID, title, description, output languages/style, draft/done state, revision, generation-input revision, active operation ID/state, input fingerprint, reservation ID, a bounded pending result, timestamps and a deletion marker.
- `listing_draft_photos`: UUID, owner ID, import ID, nullable draft ID, object key, byte size, content type, order, upload state and timestamps. Nullable draft IDs represent recoverable ungrouped imports.

The concrete migration uses foreign keys to the existing auth account and enforces owner consistency between photos and drafts. Do not store signed URLs, bearer tokens, source filenames or raw image data in draft JSON or analytics. Object keys use opaque owner/import/photo UUIDs. Server-issued read URLs are short-lived and are renewed when a draft is opened or generation begins.

All operations require a validated bearer session. Derive the owner from that session, never from the request. Enable RLS and deny unauthenticated access. Use server routes for mutation and signed upload/read grants; service helpers must scope every lookup to the validated owner. A valid photo ID from another account must still be refused. Private caching responses use `Cache-Control: no-store`.

Prepared uploads retain the existing 1280px image preparation and 4 MiB per-file ceiling. Validate completed objects on the server: expected path, MIME, nonempty image data and maximum byte size. Reject unsupported files with an actionable message. A completed photo belongs to exactly one draft or one ungrouped import; regrouping is an atomic owner-checked move.

Bound work with initial server-enforced technical limits: ten photos per item, 100 photos per import, twenty items per run, 500 retained items and 512 MiB of retained prepared photos per account. These are storage/work bounds, not new paid tiers or a promise about generation allowance. Check before accepting more work, reserve upload capacity atomically, keep existing drafts readable at the limit and offer deletion to free space. The UI displays these bounds where they affect an action. Limits remain server constants with tests; do not add a new admin-settings subsystem.

Successfully saved draft text and photos remain until the seller deletes them or deletes the account. Do not put these photos in `temp-uploads`: its one-hour idle and six-hour completed expiry cannot support return-later drafts. Reuse existing preparation and upload patterns, not that bucket's lifecycle. Incomplete upload reservations and genuinely unreferenced objects are cleaned after 24 hours; completed ungrouped imports are user work and are not orphan cleanup targets.

Deleting a draft first makes it inaccessible and cancels queued work, then removes its owned storage objects. Keep a retryable deletion record until Storage cleanup completes. A late generation result must not resurrect a deleted item. Extend the existing account-erasure operation to remove these private objects before deleting the account, and verify that retrying a partial erasure completes it. Do not claim provider backups are erased.

## API and generation integration

Add a focused account-owned drafts API family for library listing/detail, draft creation/update, photo upload grants/completion, grouping/moving, done state and deletion. Use cursor pagination with bounded page sizes; signed thumbnail URLs are generated only for the requested page/detail. Validate all IDs, text sizes, settings, counts and revision values at the server boundary.

Preserve `/api/generate` as the shared generation entry point. A new opt-in browser-draft input identifies a draft and its input revision instead of accepting arbitrary stored object paths. Resolve its ready owned photos server-side and use the existing prompt, parser, tier checks, reservation/refund and mobile request-ID behavior. Existing extension and original single-item web request formats retain their behavior.

For draft requests, compute the idempotency fingerprint from stable owned photo IDs/order/content identity plus settings and input revision, not newly minted signed URLs. The existing mobile hashing currently hashes complete URLs; applying it unchanged would break retry after URL renewal. Leave hashing for non-draft clients unchanged.

Claim the draft operation atomically with the expected input revision and the operation ID. Only one active generation may own that draft. The server issues/retrieves the same operation ID after a page reload and refuses a different concurrent attempt. This linkage outlives the existing fifteen-minute general idempotency replay window until the operation is reconciled.

Store successful generated output in the draft as part of the database completion path, not as a second optional browser save after generation. Reuse the existing mobile commit-pending response recovery. Before quota commit, persist the bounded pending result and reservation linkage on the draft as well as the existing idempotency record; the general replay cleanup must not remove the draft's recovery state. Add a draft-specific completion transaction that validates owner, operation and revisions, updates the draft and completes the idempotency record together after the reservation is verified committed. If the replay record has already expired, reconcile the durable draft operation against the reservation and pending result without another provider call. Retry/recovery uses that same completion logic. A failure to acknowledge persistence returns a recoverable pending state, never a fresh provider call or a success that exists only in browser memory.

Retain one pending result and the previous visible title/description during intentional regeneration. Manual edits during an active regeneration are blocked for that item so completion cannot overwrite newer edits. Other drafts remain editable. Errors are bounded and redacted; no generated full text or private photo URLs are added to client analytics.

## Scope and rollout

No marketplace connection, scraping, auto-publication, background-worker service, automatic grouping, offline mode, CSV/export system, team permissions, inventory/order system, new subscription product or public SEO landing family is added here.

Keep the existing mobile app server/build flags. Add the drafts rollout switch with a fail-closed disabled path; old generation behavior remains available when drafts are disabled. Review additive migrations, storage permissions and account-erasure changes before any live activation. Database preparation and a flag do not prove the customer workflow is live.

Implementation and verification happen locally and in isolated preview/staging. Do not run live Vinted tests, create production test customers, make purchases, send customer messages or deploy as part of design review. A release requires the final production gate, preview workflow evidence, migration/rollback review and production configuration checks. Disabling the new feature hides its UI and rejects new draft operations while retaining stored work for recovery; it does not delete customer drafts.

## Verification and acceptance

Before claiming ready, verify:

1. Existing auth, upload, generation, billing, attribution, extension callback and quota regressions after integration with main; the earlier 125 targeted tests passed but are only a baseline.
2. Actual drafts endpoints: unauthenticated denial, cross-account denial for reads/writes/photo grants/generation, invalid upload metadata, limits, optimistic conflicts, cursor pagination, deletion and late results.
3. Isolated PostgreSQL: owner constraints/RLS, atomic capacity reservations, regrouping, simultaneous saves, one generation claim per item, pending-result completion, expired replay recovery and account erasure. Helper mocks alone are insufficient.
4. Browser journey with stubbed external services and isolated accounts: one item, grouped import, one-photo-per-item correction, reload during import, completed uploads on return, edits on another device/session, clipboard failure, save failure, conflict resolution, partial batch failure, pause/resume, quota exhaustion and no duplicate charge on lost responses.
5. Real rendered screenshots at 360, 390, 768 and 1440 CSS pixels for empty, grouping, active batch, partial failure, editor, unsaved/conflict and quota states. Inspect images, labels, overflow, focus, contrast, safe areas and bottom-field access. Use isolated browser automation, not the user's personal Chrome.
6. Real-device Safari/Chrome checks for camera/gallery, HEIC behavior, keyboard, paste and clipboard before claiming device support. Record unavailable device proof explicitly; responsive emulation is not certification.
7. Production gate through `verify:production`, with endpoint-level tests and meaningful browser interactions. Record the exact commands and any failures or skipped gates.

Acceptance is a recoverable, understandable seller journey backed by these checks. Do not call it flawless or fully verified from appearance, unit tests or a mocked success state alone.

## Baseline evidence, October 9

On the existing mobile-web worktree, `npm test` passed 90 files / 575 tests and `npm run type-check` passed. The spec passed Prettier and whitespace checks. These results verify the existing branch before main integration, not the proposed saved-drafts/bulk functionality. No product code, database, feature flag or deployment changed during design preparation.
