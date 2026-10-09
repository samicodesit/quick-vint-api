# Browser drafts release handoff

Prepared October 9, 2026 on `codex/mobile-web-phase1` in `.worktrees/mobile-web-phase1`. **Not deployed.** No production migrations, flags, account changes, marketplace actions or customer messages were performed. Production main was merged into this branch at `9df3ff6`; the existing browser-app work and current production fixes are included.

## Delivered behavior

The existing `/app` workspace can prepare listings without an extension or marketplace connection. Sellers can save photos and text, group a bulk import into items, correct covers/groups, generate selected items sequentially, review/edit/copy results, and organize completed work under Done. Existing accounts, subscriptions and generation allowances are reused.

Edits save with acknowledged versions and explicit cross-device conflicts. An owner-scoped session recovery copy retains its original saved version. A batch retains operation IDs before dispatch and recovers accepted results after reload without another provider request. Closing the tab stops dispatching remaining items; it does not cancel an already accepted generation or promise background processing.

Limits: ten photos/item, 100 photos/import, twenty items/run, 500 active saved items, 512 MiB reserved photo capacity/account and 4 MiB/prepared JPEG. Three concurrent photo uploads; sequential generation. Completed drafts and ungrouped uploaded photos do not expire automatically.

Private photos use an authenticated same-origin binary endpoint. It checks ownership, reserved size, JPEG signature and upload expiry before writing to the private Storage bucket. Signed URLs are short-lived read URLs only. Reservation and cleanup mutations share an account lock. Expired pending uploads become tombstones before cleanup, preventing a renewed upload from being deleted by an older sweep. Cleanup retains tombstones through the upload grace period and retries Storage failures. Deleted photo capacity is released after cleanup, rather than immediately.

## Local verification

The draft UI was subsequently reworked at the user's request with a compact heading, a photo gallery, readable Inter/Inter Tight typography and translucent glass panels. Batch selection appears only after Select; photo tools and language/style settings use disclosure controls. Empty drafts focus on photo upload or an explicit Write it myself action. Generated text becomes the editor's main view, with photos collapsed and direct copy buttons. Bulk grouping gets its own focused view. Generation, autosave, recovery and ownership contracts remain the same.

The redesign's production gate passed **115 files / 815 tests** (test run began October 9 at 13:13:13 Europe/Amsterdam). The revised browser suite passed **24 checks** with zero page errors, including initial disclosure, manual writing, safe empty-draft deletion and creating a draft from bulk import. Responsive captures cover 360, 390, 768 and 1440 pixels; selected final desktop/phone gallery, editor, upload and error states were visually inspected. See the updated [QA evidence](qa/browser-drafts/README.md). The interactive localhost demo uses the actual rebuilt UI with fixture data and simulated generation; it is not a staging deployment.

- Final `npm run verify:production` passed after review corrections: lint, TypeScript, feature-enabled build (132 pages), formatting and **115 files / 814 tests**. Test run began October 9 at 03:25:53 Europe/Amsterdam; all five gate stages exited successfully.
- Real PostgreSQL SQL/RLS ran in the installed PGlite engine: owner/version constraints, regrouping, capacity limits, generation completion/replay after general expiry, private bucket permissions, auth erasure and cleanup fencing. This is actual SQL execution in one database connection; it does not establish multi-connection behavior.
- `scripts/test-browser-drafts.mjs` uses isolated Chromium, fixture authentication and intercepted APIs/Storage/provider responses. It exercises real rendered UI, image preparation, upload retry, grouping/corrections, acknowledged saves, clipboard fallback, cross-device conflict, session recovery, paused and interrupted queues, quota/minute guards, unrelated editing, safe keyboard deletion and partial failure. No customer/provider/marketplace requests are made.
- Rendered empty, editor, grouping, batch, save-error, conflict, quota and partial-failure states are captured at 360, 390, 768 and 1440 CSS pixels and checked for horizontal overflow. Selected final screenshots and the browser result are under `docs/qa/browser-drafts/`; the complete screenshot matrix is `/tmp/autolister-draft-final-browser` in this workspace session.
- A fresh independent release review found and drove fixes for delayed refresh losing edits, stale session recovery bypassing version conflicts and cleanup deleting a renewed upload. The reviewer rechecked the corrections and confirmed no remaining defects in those fixes. The related same-item navigation race is included in the browser regression.

Deleting a draft clears its title, description and pending output in the committed mutation. If immediate Storage removal fails, the deletion still succeeds and durable tombstones keep photo cleanup retryable; the UI does not report a false save failure for an already deleted item. SQL and service regressions cover these cases.

A second review pass on October 9 fixed an upload-retry ownership check that could accept a photo whose owner had been removed. A real SQL regression failed before the correction and passed afterward. The fresh production gate passed **115 files / 815 tests**, including eleven PGlite cases, with its test run starting at 11:45:06 Europe/Amsterdam. The browser suite passed all 23 checks again with zero page errors. An additional interactive demo smoke checked editing, acknowledged save/reload, exact clipboard copy, real browser photo preparation/upload, bulk grouping, simulated generation, Done and deletion. Desktop and phone screenshots were inspected. The localhost preview returned HTTP 200 from Windows; it uses fixture accounts and simulated generation, with no customer data or charges. Logs and screenshots for this pass are in `/tmp/autolister-draft-review-pass.log` and `/tmp/autolister-draft-review-browser` in this session. The staging and physical-device limits below still apply.

Browser command after a feature-enabled build and local preview:

```bash
PUBLIC_MOBILE_WEB_APP_ENABLED=true \
PUBLIC_LISTING_DRAFTS_ENABLED=true \
PUBLIC_SUPABASE_URL=https://drafts-test.supabase.co \
PUBLIC_SUPABASE_ANON_KEY=test-anon npm run build
npm run preview -- --host 127.0.0.1 --port 4330
```

In another shell, set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to existing installed tooling when Playwright is not available in the repo, then run:

```bash
DRAFT_BROWSER_URL=http://127.0.0.1:4330 \
DRAFT_BROWSER_OUTPUT=/tmp/autolister-draft-final-browser \
node scripts/test-browser-drafts.mjs
```

The dummy public key/URL are exclusively for this intercepted local fixture journey. Never copy them into a deployed environment.

## Before production activation

These are deployment steps, not actions performed during this task.

1. Review the entire branch against the latest production main. Reconcile any newer production commits before integrating; run the production gate on the integrated tree. Preserve the phone-upload, billing, generation and extension contracts.
2. In a disposable staging Supabase project, verify the existing pricing/reservation schema and apply `migrations/2026-09-23_mobile_web_generation_idempotency.sql` before `migrations/2026-10-09_listing_drafts.sql`. The new migration is transactional and additive; it is intended to run once. Check service-only RPC/table grants and that `listing-drafts` is private with JPEG/4 MiB limits. Do not add public Storage policies.
3. Validate actual Supabase Storage upload/read/remove, PostgREST RPC behavior and multi-connection races in staging: simultaneous save/claim/grant, cleanup versus renewal/completion, erasure versus an accepted upload, and commit-result recovery. Use isolated staging accounts/data and provider fixtures where possible. These external integration checks remain unperformed locally.
4. Configure the existing auth allowlist for `/app/auth/callback` and the exact preview origin. Check `VERCEL_APP_ALLOWED_ORIGINS`, `VERCEL_APP_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, the existing generation provider credentials and `CRON_SECRET`. The browser receives only the project URL and public anon/publishable key; never a service-role key.
5. Stage both server flags `MOBILE_WEB_APP_ENABLED=true`, `LISTING_DRAFTS_ENABLED=true`, and both build flags `PUBLIC_MOBILE_WEB_APP_ENABLED=true`, `PUBLIC_LISTING_DRAFTS_ENABLED=true`. Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` for that staging project. Public flags/keys require a rebuild. Leave production flags unchanged until staging acceptance.
6. On real iOS Safari and Android Chrome, check camera/gallery, HEIC rejection or conversion, orientation, keyboard/bottom controls, photo preparation, clipboard and manual paste. Responsive Chromium emulation does not establish device support. Verify email/Google auth and existing Stripe portal/return in staging without purchases.
7. After release authorization, apply the reviewed additive migrations in production before enabling the app. Check the existing hourly `/api/cron/daily-cleanup` has valid authorization and reports successful `listingDraftPhotos` cleanup. Use the established `npm run push:production` from main for the production push; do not manually deploy on top of the normal automatic Vercel deployment.
8. Verify the deployed `/app` origin/headers/auth, account-owned draft/photo lifecycle, stable operation recovery and quota display with safe authorized checks. Check a second account cannot access another account's draft or photo. Customer communication follows the separate Resend/template review rules.

The older Docker/Postgres multi-connection harness could not run because this machine has no Docker daemon. PGlite covers the migration logic but does not replace that staging gate. Physical devices, real deployed Storage/provider wiring, live auth redirects and the deployed end-to-end journey are not certified by local fixture results.

## Rollback

Set server `LISTING_DRAFTS_ENABLED=false` to reject new draft operations, then rebuild with `PUBLIC_LISTING_DRAFTS_ENABLED=false` to restore the previous browser composer. For a whole browser-app rollback, disable its existing server/public app flags as well. Keep the additive tables, private bucket, saved work and cleanup enabled; cleanup intentionally runs with rollout flags off. Do not drop tables, make the bucket public, delete accounts, alter subscriptions or reset allowances. An in-flight operation may finish while disabled; its stored result remains available when the feature is restored.
