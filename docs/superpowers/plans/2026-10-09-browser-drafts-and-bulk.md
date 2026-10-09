# Browser drafts and bulk implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver recoverable account-owned listing drafts and bulk preparation in the existing browser app, ready for review at the deployment boundary.

**Architecture:** Extend the mobile-web client with a draft workspace backed by private Storage and owner-scoped database functions. Reuse authentication, image preparation, usage, billing and the shared generation endpoint. Execute inline in the existing isolated worktree; the user's October 9 instruction authorizes completing planning, implementation and verification without intermediate approval stops, and explicitly stops before deployment.

**Tech Stack:** Astro, TypeScript, Supabase/PostgreSQL/Storage, existing Vitest, isolated Playwright browser tooling.

**Spec:** `docs/superpowers/specs/2026-10-09-browser-drafts-and-bulk-design.md` (approved in conversation).

## Global constraints

- Preserve current production fixes by merging main into this feature branch, never pushing main or changing live flags/databases.
- Reuse existing accounts, subscriptions, model/prompt, quota reservation/refund and original extension contracts.
- Private account-owned drafts and photos, no raw filenames/tokens/signed URLs in stored draft JSON or analytics; no-store API responses.
- Ten photos/item, 100/import, twenty items/run, 500 retained items, 512 MiB/account, 4 MiB/prepared upload, three concurrent uploads.
- Saved photos and text survive return visits; completed ungrouped photos are not garbage collection targets.
- Keep existing visual tokens and components. Accessible pointer/keyboard controls, 360px minimum, mobile full-width editor and desktop list/editor.
- No marketplace actions, production test customers, purchases, messages or deployment. Real-device checks cannot be represented by emulation.

**Completion evidence:** `docs/browser-drafts-release.md`. Implementation is complete locally; staged infrastructure and physical-device validation remain explicit release gates. The approved execution rulings use PGlite instead of unavailable Docker and authenticated bounded uploads instead of per-object signed upload grants. Tasks 2–5 form one integrated feature commit; Task 6 evidence is committed separately.

## Review focus

- A lost response after a charge must recover the saved result without a new model call or generation ID, including after general replay expiry.
- Two devices saving or changing photo groups must not overwrite each other or create cross-owner associations.
- A signed-upload grant racing deletion/capacity limits must not resurrect an item or exceed reserved account storage.
- Switching drafts, signing out, or background generation must not replace unsaved text with another item's result.
- Partial photo imports, clipboard failures, quota exhaustion and small-screen keyboards must leave an understandable next action.

## File structure and interfaces

- `migrations/2026-10-09_listing_drafts.sql`: tables, private bucket, owner/limit/version/grouping/generation RPCs and service-only privileges.
- `utils/listingDrafts.ts`: validated service boundary, owned repository, photo reservations/completion, storage cleanup, generation recovery. `DraftError(status, code, message)` is the shared safe error.
- `src/app/mobile-web/draftContracts.ts`: browser-safe limits/types and settings validation; no server dependencies.
- `api/drafts.ts`: bearer-authenticated action API consumed by `draftClient.ts`.
- `utils/draftGeneration.ts`: opt-in generation resolution/pending/completion adapter, used by `api/generate.ts`.
- `src/app/mobile-web/draftClient.ts`: typed API calls with existing session refresh.
- `src/app/mobile-web/draftWorkspace.ts`: persistent library/grouping/editor/upload/save state and event bindings.
- `src/app/mobile-web/draftWorkflow.ts`: serialized autosave and sequential queue/pause decisions; `draftClient.ts` reconciles durable operation IDs.
- `src/components/mobile-web/DraftWorkspace.astro`, `src/styles/listing-drafts.css`: existing-brand responsive workspace and accessible controls.
- `src/app/mobile-web/app.ts`, `src/pages/app/index.astro`, `.env.example`: opt-in mounting and feature flags with old path preserved.
- `scripts/delete-user-by-email.mjs`, `api/cron/daily-cleanup.ts`: durable private-photo erasure/retry and incomplete-upload cleanup.
- Endpoint/unit tests under existing `src/**/__tests__`; actual migration SQL in `listingDraftsDatabase.test.ts` and browser verification in `scripts/test-browser-drafts.mjs`.

### Task 1: Integrate current production fixes and prove baseline

- [x] Merge local main into the feature worktree and resolve phone-upload/generation conflicts preserving both contracts.
- [x] Run `npm test` and `npm run type-check`; require a passing baseline before new functionality.
- [x] Commit the integration and record exact evidence in the execution ledger.

### Task 2: Owned persistence, photo lifecycle and API

**Interfaces:** `Draft`, `DraftPhoto`, `DraftSettings`, `DRAFT_LIMITS` in `draftContracts.ts`; `handleDraftAction(userId, action, input)` in `listingDrafts.ts` returns typed JSON. Mutations require `expectedVersion`; photo grant/completion uses opaque photo IDs. `api/drafts.ts` derives ownership exclusively from bearer auth.

- [x] Write and run failing validation/API tests for authentication, ownership scoping, invalid input, disabled flags, limits and revision conflicts.
- [x] Implement the shared contract, migration, owner-scoped service and action endpoint. Reserve capacity atomically before bounded same-origin upload; verify bytes/MIME before finalization.
- [x] Execute actual SQL in an isolated PGlite PostgreSQL harness for RLS, regrouping, version mutations, limits, deletion, cleanup fencing and generation-state RPCs. True multi-connection races remain a staging gate.
- [x] Run focused tests/type-check, inspect grants and commit the persistence/API deliverable.

### Task 3: Durable generation and recovery

**Interfaces:** `prepareDraftGeneration(userId, input, operationId)` returns server-owned photo URLs, settings, stable fingerprint and any replay; `storeDraftGeneration(...)`, `completeDraftGeneration(...)`, `recoverDraftGeneration(...)` persist/reconcile against existing quota reservations. Original non-draft requests are unchanged.

- [x] Write failing endpoint tests for owned draft input, immutable fingerprint across URL renewal, active-operation conflicts, pending-result persistence, replay and late completion after deletion.
- [x] Add opt-in draft resolution to `/api/generate`; persist pending result before quota commit and complete the draft transaction after verified commit. Preserve the old output while regenerating.
- [x] Test explicit failure/refund, expired general replay and lost-response recovery using the SQL harness and endpoint tests; a recovery path must not call the provider.
- [x] Run generation/entitlement regressions and commit.

### Task 4: Seller workspace, uploads, grouping and autosave

**Interfaces:** `mountDraftWorkspace(root, { userId, onUsageChange })` returns cleanup; `draftClient.ts` consumes the action API and existing `fetchMobileJson`; use `prepareMobileImage` and `copyListingField`.

- [x] Write failing client/browser tests for save/version conflicts, owner-scoped recovery copies, upload ordering, group selection and recovery actions.
- [x] Implement library/composer/grouping/editor views, real per-photo upload state, additive camera/gallery imports, cover/move/remove controls and draft/done state.
- [x] Implement acknowledged debounced/blur saves, flush-before-navigation, explicit conflict choices and session-scoped recovery. Block active-item mutation; background results never replace another editor.
- [x] Implement responsive existing-brand markup/styles with keyboard focus, live statuses, real thumbnail identity and safe dialogs. Preserve original app path with flags disabled.
- [x] Run focused tests, type-check/build and commit.

### Task 5: Bulk queue and privacy/cleanup integration

**Interfaces:** `DraftQueue` owns item IDs and sequential requests, supports pause-after-current, and stops for auth/quota/uncertain outcomes. Only server capacity is displayed/used; deliberate regenerate starts a new operation with confirmation.

- [x] Write failing queue tests for partial failures, pause, quota limits, lost responses and review of an unrelated item while generation completes.
- [x] Implement bulk selection/counts, settings defaults/overrides, resume/check-result controls and latest usage refresh.
- [x] Extend account deletion with owned private-object cleanup before auth deletion. Clean pending uploads/deletion tombstones; never expire completed drafts/imports.
- [x] Run focused tests plus SQL checks and commit.

### Task 6: End-to-end interaction, visual QA and deployment handoff

- [x] Add/run isolated browser journeys for single and bulk, grouping correction, reload, save failure/conflict, clipboard fallback, pause/quota and interrupted requests.
- [x] Capture and inspect actual rendered empty/grouping/batch/editor/error states at 360, 390, 768 and 1440px; fix clipping, misleading states and focus issues.
- [x] Run `npm run verify:production` and the SQL/browser suites; fix failures and record exact results.
- [x] Review the whole branch with a fresh reviewer per the execution skill; fix material findings with regression checks.
- [x] Commit evidence and a deployment checklist with migrations, flags, rollback and explicit physical-device/staging limits. Stop before deployment, migrations against production, main push or customer communication.
