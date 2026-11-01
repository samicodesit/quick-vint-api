# Listing model photos: 1.4.30 release candidate

Status: local candidate prepared. Nothing pushed, deployed or submitted to the store. Model-photo flags remain off in production. The owner's Vinted approval decision is settled.

## What changed during release preparation

- Both feature branches include the current production mainline. Draft edit observations, account-switch cancellation and current billing-expiry protection were retained.
- Listing-photo checks now use GPT-5.4 (2026-03-05), low reasoning. Suitability classification and saved front-model checks retain GPT-5.4-mini. Cost accounting records the actual model separately.
- The checker sees the accepted pose, candidate and target product surface. An additional front detail image had caused demands for front hardware on a rear view. Detail references still inform image generation.
- Checks explicitly distinguish a sleeveless dress from a retained base T-shirt and short handles from invented shoulder straps. Bag generation permits natural hand or elbow carry without lengthening handles.
- Privacy copy covers appearance choices, private front/rear models, OpenAI processing, temporary sources, local draft copies and deletion. The privacy page's mobile header clipping and heading hierarchy were corrected.
- The real existing-listing test now exercises the exact minified release package without adding hooks to product files.

## Verification

- API production gate: lint, type checking, build, formatting and 1,351 tests passed; 14 opt-in skips.
- Extension: 168 unit tests passed. The fresh complete browser run passed 380 tests with 13 opt-in skips, including the corrected associated-field language assertions.
- Exact ZIP: 60 files, 646,530 bytes. Eight focused tests passed against its minified content, including native ordering, partial upload, unsupported ordering, separate language controls and the model switch.
- Optional saved-model web journey: 10 passed. Photo web journey passed text-before-photos, recovery, insertion, local-blob reload, reduced motion and desktop/mobile layout checks.
- Real Vinted existing listing: exact candidate attached the two cached model photos first in 4,290 ms. Three originals, title and description were preserved. A host rerender retained order; reload discarded changes and proved the published listing unchanged. Zero provider calls and zero save/publish clicks.
- Disposable PostgreSQL 12.22 rehearsal passed both migrations, role restrictions, concurrent two-job limit, duplicate leases, unknown-outcome fencing, billing-expiry checks, shared spending protection, refunds, cleanup and account-deletion tombstones. UUID and Supabase storage metadata were local fixtures. The existing PGlite suite provides additional current-engine coverage. This is not a deployed Supabase storage/API smoke test.

Evidence: parent workspace reports/release-preparation-20261101. Earlier create-page native upload/order evidence remains in reports/release-audit-20261101 and reports/model-garment-qa-20261101.

## Quality, cost and latency

The final 18-case replay matched the reviewed expectations, including rejecting retained T-shirts, invented rear logos and elongated bag handles. A fresh corrected bag pair also passed with natural phone/arm poses. This is a small regression set, not a measured production accuracy rate. Exact anatomy, fit and unseen garment details are not guaranteed. Keep originals and removal controls.

Final replay checker median: 3.15 seconds per view; both views run concurrently. The fresh bag generation took about 11 seconds per view. That test took 16.1 seconds with a cached pose and plan, including a one-off rear-pose recheck. Native attachment was measured separately at 4.29 seconds, so these are not a single end-to-end latency measurement. Text generation is unchanged.

Expected API cost is approximately $0.09 to $0.11 per eligible pair plus text, depending on image tokens, caching and output reasoning. The fresh bag generation/check test cost $0.094378 including one rear-pose recheck, without classification. Unknown outcomes retain conservative reservations; explicit retries can add cost. The original $0.08 to $0.09 estimate used the smaller checker.

The fresh held-out mixed-panel jacket took 18.86 seconds for classification, concurrent generation and checks, before upload. It cost $0.09746075. Both automated checks accepted it. Human review found plausible phone and arm poses and preserved major material panels, but an apparent extra small lapel snap on the front. The checker did not flag that detail. This remains a garment-fidelity limitation, not evidence of exact reproduction.

New authorized $3 testing cap: $0.72250765 used; $2.27749235 remains. The earlier separate budget is excluded. No additional paid tests are needed for this candidate.

## Fresh UI and UX pass

The selected layout was reviewed in rendered screens, including real Vinted at 1440, 1280, 1024 and 375 pixels wide. Laptop captures use 768-pixel height. Generate remains the primary action, language controls stay beside their fields, the model uses a real thumbnail and its own switch, and style/help/tour panels fit the shorter viewport. No listing was published or saved.

Web review covered onboarding, invitations, nested settings, preparation, generation, upload, recovery and completion on desktop/mobile. Two web-only details were corrected: the header model entry now uses the existing compressed photo instead of the old small icon; the standalone model dialog now has a close control at the upper right while nested settings retain their back control. Keyboard opening, Escape, focus restoration, image loading and reduced motion passed in the browser journey. These edits do not change the extension ZIP.

Fresh evidence: parent workspace reports/release-fresh-pass-20261101. These are local web renders and the local packaged extension on real Vinted, not deployed web UI. Actual screen-reader behavior and Orion/Safari were not exercised; responsive Chromium checks do not establish browser-engine coverage.

## Rollout, after explicit approval

The AI-output legal copy update is documented in [AI outputs, complaints and refund wording](ai-output-terms-20261101.md). Before applying material terms amendments to existing customers, deliver the required notice and preserve the applicable historical terms. A deployment does not itself establish acceptance or remove existing refund rights. No customer notice has been sent.

1. Confirm the exact target Supabase/Vercel project and deployment commit, take the normal database backup, and export the current definition of reserve_generation_request_for_current_status. Verify deployed paid-access expiry protection before replacing that function.
2. With USER_MODELS_ENABLED and LISTING_MODEL_PHOTOS_ENABLED off, apply migrations/2026-11-01_user_models.sql, then migrations/2026-11-01_listing_model_photos.sql to staging first. If the saved-model migration is already recorded, do not run its CREATE TABLE statements again.
3. Deploy the reviewed backend, privacy copy and web assets with flags off. Verify the private user-models and listing-model-photos buckets, service-role-only access, signed URL expiry, CRON_SECRET authorization and minute recovery schedule.
4. On an internal staging account, enable the saved-model flag and listing-photo flag. Exercise creation or reuse, eligible and skipped items, retry, cross-account denial, URL expiry, source cleanup and account deletion through the deployed API/storage path. Use cached results where possible; any further paid calls must stay inside the remaining cap.
5. Verify existing text-only clients with both flags off and with only saved models on. Confirm queued jobs recover and cleanup still runs after the photo flag is disabled.
6. Review ops/listing-model-photo-monitoring.sql: text latency, per-stage photo latency, failed jobs, unknown costs, attachment failures, retry rate and actual cost per completed pair. Investigate every unknown provider outcome. Pause rollout if costs exceed the planned range or recurring anatomy/item defects appear.
7. Apply the same approved migration/deployment sequence to production. Enable features only after the deployed smoke checks pass. Upload the verified 1.4.30 ZIP and publish only with explicit approval. Do not mark CHROME_WEB_STORE_VERSION uploaded before an actual successful submission.

## Rollback

Disable LISTING_MODEL_PHOTOS_ENABLED first. If saved-model creation is affected, disable USER_MODELS_ENABLED too. Keep private buckets, migrations and the cleanup cron installed so existing assets and tombstones can expire safely. Do not drop tables or delete accepted models. Retain the additive cost-aware billing wrapper unless its behavior is the cause; restore the exported prior function only under the normal database change approval. Roll back web/API code to the last verified deployment while keeping schema compatibility. A store rollback requires a new higher extension version.

## Store disclosure draft

Release notes: Create a reusable private model and add two model photos to suitable listings. Review listing text while photos finish, or add model photos separately to an existing listing. Compact writing controls, separate title/description languages and a short optional tour make setup easier.

Privacy disclosure changes: user-provided item images, appearance preferences and generated model images are processed to provide the requested feature. Saved models are tied to the signed-in account. Supabase stores private assets; OpenAI processes selected inputs. Temporary sources expire after 24 hours and server listing outputs after 30 days. Local browser drafts remain until removed. Update the store's user-content/privacy answers to match the final privacy policy during submission. No added extension permissions or host access.

Remaining external gate: approved staging and production migration/deployment verification. Local tests do not replace it. No publication is authorized by this document.

Submission references checked on November 1, 2026:
[Chrome Web Store privacy disclosures](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
and [upload, review and deferred publishing](https://developer.chrome.com/docs/webstore/publish).
