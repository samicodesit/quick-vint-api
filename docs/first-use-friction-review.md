# First-use friction review, 2026-11-02

Status: local changes only. No deployment, store upload, production account action,
email or paid generation. Existing model-content publication hold is unchanged.

## Decisions and changes

- The shared mobile navigation sent its main action to the Chrome Store. It now
  opens `/app?ref=nav_mobile_<locale>` in the same tab, with `web_app_click`
  tracking. Extension installation has its own secondary link and tracking
  context. All eight existing site translations are reused. Desktop navigation
  keeps its existing destination.
- The menu scrolls on short screens. The pricing-card heading can wrap at
  360 px and below; the German badge previously extended past a 320 px viewport.
- Replaced the hardcoded English lifetime-listing label on localized pricing
  cards with the corresponding site translation. The five-listing quota is unchanged.
- Model choices now survive closing and reopening the toolbar dialog or settings
  subview in the current workspace session. Initial onboarding choices seed the
  same draft. Nothing is created until the existing explicit Create model action.
- Draft choices stay in memory, scoped by account. Signing out/reset, account
  mismatch or disposal clears them. Refreshing the page also clears these
  unsubmitted choices. A ready model clears its leftover setup draft.
- Added an optional `onPreferencesChange` callback to the shared model UI. The
  extension mirror remains byte-identical. No appearance data is added to analytics.
- Fixed a second confirmed settings bug: Back to settings removed its button,
  then the document outside-click handler closed the entire panel. The handler
  now checks the original event path rather than containment after DOM removal.

## First-item audit

Inspected the actual locally rendered mobile and desktop app with fixture auth
and API responses. The photo selector is the main action after style setup.
Model discovery stays in the header. An unseen invitation remains optional;
Not now returns to photo selection. Guest onboarding can skip model setup, or
carry chosen preferences through sign-in. No extra onboarding text or prompts
were added. Repeated form visits alone still do not establish user confusion or
selected preferences.

## Verification

`src/pages/__tests__/firstUseBrowser.integration.test.ts` exercises the real app:

- All eight mobile pricing menu destinations, separate extension link and event.
- First invitation dismissal and access to the photo selector.
- Guest model skip and chosen preferences through fixture email-code sign-in.
- Dialog close/reopen, Escape, settings subview return, and cross-entry retention
  at 390 px and 1365 px.
- Same-page sign-out and sign-in clears the unfinished draft.
- No model-create requests during any of these paths.

All network auth/API responses in these checks are local fixtures. This does not
reverify live signup delivery or image generation. Standalone visual checks also
cover the 320 x 568 menu and pricing card, with no horizontal overflow.

Final website gate passed: lint, type check, build, formatting and 1,382 tests.
The six opt-in first-use browser tests also passed separately against the built
site. Those include every localized quota label in its rendered pricing page.

Extension checks: 168 unit tests passed. Across the initial browser run and the
corrected coordinated run, 382 unique cases passed and 13 stayed skipped (395
enumerated cases, no unresolved failure). The initial run selected the older
`quick-vint-api-orion` sibling for coordinated phone-page fixtures. After confirming
the mismatch, the remaining stale-fixture work was interrupted and all six
backend-dependent test files were rerun with `AUTOLISTER_API_PATH` explicitly set
to this checkout. All 25 of those tests passed. No product workaround was made for
the stale fixture. Preserve this explicit path for future coordinated checks.

Run the opt-in browser tests against a local Astro server or built preview:

```sh
PUBLIC_LISTING_DRAFTS_ENABLED=true PUBLIC_MOBILE_WEB_APP_ENABLED=true \
PUBLIC_SUPABASE_URL=https://drafts-test.supabase.co \
PUBLIC_SUPABASE_ANON_KEY=fixture-key PUBLIC_USER_MODELS_ENABLED=true \
npm run dev -- --host 127.0.0.1 --port 4332

RUN_FIRST_USE_BROWSER_TESTS=1 npm test -- src/pages/__tests__/firstUseBrowser.integration.test.ts
```

Visual evidence is stored in the desktop visualization folder `first-use-review`.
The mobile model before/after captures show the same close/reopen action.
The previous menu comparison uses the previous navigation markup in the same
local page, with its original Chrome Store target. Flag artwork was served from
an unchanged cached flagcdn image because direct browser loading was unreliable.
The original unmodified before capture is retained separately.

## Release boundary

This is not a deployment approval or a claim about improved conversion. Keep the
existing explicit permanent-model confirmation. Review actual first-item
activation after a separately authorized release. No new tracking event or
customer outreach is necessary for these fixes.
