# Model-photo website release, November 2, 2026

The owner authorized the prepared release after Chrome extension 1.4.30 became
public. Google's public update service independently returned a CRX3 package
whose manifest version is 1.4.30. The local release status has no pending package.

## Scope

- Existing reviewed homepage promotion, retaining both experiment variants.
- Four localized model-photo feature pages and eight localized guide pages.
- Existing article CTA corrections, metadata, internal links and sitemap/feed entries.
- AI-referral attribution and successful model-photo attachment tracking.
- Reviewed first-use fixes: mobile web entry, temporary model preferences,
  settings return, narrow-screen wrapping and localized pricing quota labels.

No new extension upload, customer message, social post, advertising spend,
database migration or provider/model configuration change is part of this release.
The extension mirror's optional preference callback remains local for a future
extension source update; published 1.4.30 does not need it for this web change.

## Production mechanism

Use the existing Vercel project linked to samicodesit/quick-vint-api, production
branch main. Set only `MODEL_PHOTO_CONTENT_ENABLED=1` for production builds.
Existing production model and web-app flags were already enabled.

Fast-forward main to the reviewed work and use `npm run push:production`.
Git-triggered deployment is the normal mechanism. Do not issue a second manual
deployment. Verify the resulting production deployment's commit and public pages.

## Verification and evidence

The preparation evidence is recorded in `model-photo-discovery-progress.md` and
`first-use-friction-review.md`. Run a fresh enabled release gate and check the
12 campaign routes, existing guides, main CTA destinations and page metadata.
Check live desktop/mobile rendering after deployment, including both homepage
variants. No paid image generation or live marketplace publication is needed.

The final deployment receipt, route/link checks and rendered evidence are retained
in the owner's `model-release-20261102` visualization folder. Do not interpret
this source record as proof of a completed deployment without that receipt.

## Rollback

Disabling `MODEL_PHOTO_CONTENT_ENABLED` requires a new build. It hides the new
campaign routes and crosslinks while preserving unrelated posts. For a broader
regression, roll back the deployment to the recorded pre-release production SHA
`9dcf078a7c22b460f0f286d66cdf6a335c2485dc`. That also removes the newly released
homepage promotion and first-use changes. Retain the existing release boundaries.
