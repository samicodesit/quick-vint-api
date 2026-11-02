# Execution ledger: model-photo-ai-discovery-plan.md

Prepared on codex/model-photo-discovery. Base: 95b46df. The owner authorized
publication on November 2 after extension 1.4.30 became public. Earlier hold
notes below describe the preparation phase. See the release record for execution.

1. Feature page and localized guide integration: complete locally. Four feature routes and eight guide routes, using the four exact approved comparison exports and localized real setup captures.
2. Product facts and metadata: complete locally. Corrected the remaining extension-only blog footer and German English-only claim. Web-first navigation on model pages, separate Vinted extension links, updated app descriptions, correct Person author on the seller story, canonicals, language alternatives, social images and internal links. Existing main setup-guide phone facts were already correct and were preserved.
3. Referral-to-model tracking checks: complete locally. Added model_photos_attached after successful local persistence, retaining job identity, expected account and original attribution. Regression tests cover success, attachment failure and repeated observation. The actual model UI completion and 28 CTA clicks across 12 pages passed browser checks with mocked transport. No live telemetry or paid generation.
4. Desktop/mobile visual review and production checks: complete locally. Default and enabled production gates passed: lint, types, build, format and 1,381 tests. Fourteen existing opt-in tests skipped. Enabled build has 149 pages; default has 137 and excludes all held campaign routes and sitemap entries. Final copy-only adjustment also rebuilt successfully.

Pre-flight: feature routes, guide collection, related links and schemas share one build-time release flag. Default builds must exclude the held content. Existing unpublished homepage commit and first-touch patch are preserved.

Ruling: keep implementation in the existing isolated checkout on a new local branch. No push or merge. Review inline, following the user's routing rule against delegation for this task.

Ruling: apply the release hold at route/list/feed selection, not inside the persisted content schema. Astro caches validated content, so environment-dependent schema transformations can retain the wrong preview state. Existing drafts stay hidden in either mode.

Ruling: use a readable localized caption for the hero's existing counts on phones. The comparison graphic itself stays byte-identical. Keep full-size image links rather than rebuilding listing cards.

Validation: 24 desktop/mobile renders across all pages and languages, plus 24 narrow-phone/laptop checks at 360px and 1024px. No horizontal overflow or clipped article content. Keyboard focus and reduced-motion scrolling checked. All four comparison exports match the source bytes. New runtime event accepted by the event-ingestion tests; model creation, account fencing and attribution tests pass. No new font, icon library, dependency, migration, provider call or production operation.

Evidence: final rendered views and browser QA summaries are retained in the user's `model-discovery-site-review` folder beside the earlier `model-launch-kit`. Only the earlier unrelated node_modules entry was present before this work; it is left untouched.

## Release conditions

- Keep `MODEL_PHOTO_CONTENT_ENABLED` unset until the extension update is public and the owner approves publication. It is a build-time switch, not a client feature switch.
- Enable with `MODEL_PHOTO_CONTENT_ENABLED=1` for the release build. The flag controls the feature routes, campaign blog posts, feed/index entries and new crosslinks. No homepage experiment allocation was changed.
- Set the two guides' actual publish date at release if it differs from November 2. Do not refresh existing articles' dates merely for search.
- Fresh signup, paid activation and live conversion delivery were not exercised. Local checks use the real UI/client/storage paths with mocked API/provider boundaries. Live assistant recommendation visibility and full crawler-origin CDN access remain unmeasured, not failures or claimed successes.
- Re-run the required gate at release if intervening changes occur. No publish, push, email, social action or spending occurred.

Design: existing Geist typography, white canvas, slate text, brand purple action. One large exact comparison is the hero's visual focus. Left-aligned copy, compact actions, no extra fonts or animated decorations. Guide articles use the existing blog layout with readable comparison figures and the actual localized setup capture.
