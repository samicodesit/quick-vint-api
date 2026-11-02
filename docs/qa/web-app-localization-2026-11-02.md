# Seller web app localization QA, 2 November 2026

QA status: completed against the local implementation before release. The owner
subsequently authorized the production push. Customer email, live generation,
payment and Vinted actions were not used for this verification.

## Scope and cause

The seller web app had complete translations for some onboarding, model-photo
and billing controls, alongside hard-coded English workspace, error and paywall
copy. Any non-English interface could therefore mix languages. Browser UI locale
and selected listing-output languages also needed to remain independent.

This pass covers all 18 supported locales: English, French, Czech, Danish, Dutch,
German, Greek, Croatian, Finnish, Hungarian, Italian, Lithuanian, Polish,
Portuguese, Romanian, Spanish, Slovak and Swedish. The browser extension is
excluded, as requested. Its installation suggestion inside the web app is covered.

## Implementation and review

- Added one browser-locale resolver and a complete workspace catalog, reusing the
  existing onboarding and billing dictionaries. Czech `cs`, `cz` and regional
  aliases resolve to the same UI; HTML uses the BCP 47 tag `cs`.
- Covered initial shells, templates, dynamic labels, accessible names, validation,
  account and quota errors, pause/payment dialogs, photos, QR/phone upload,
  sign-in recovery and ChatGPT handoff. Standalone phone upload uses the same
  generated catalog through a small classic-script runtime.
- Translate application copy before inserting user data. The initial root is
  localized only once, including on remount. Listing titles, descriptions, seller
  notes, filenames, API enums and telemetry field names retain their values.
- Preserved specific payment and conflict-recovery instructions instead of
  substituting unrelated short labels. Unknown provider diagnostics use a
  translated generic recovery message.
- Allowed photo-tool buttons to wrap when translated labels exceed the available
  width. Before the fix, the Greek hide-area button extended to x=430 in a
  390-pixel viewport.
- Review was performed inline under the owner's no-delegation instruction. It
  included protocol fields, user-content boundaries, lazy templates, accessible
  names, compact copy and the exact meaning of recovery actions.

## Verification

`npm run verify:production` passed: lint, TypeScript, production build, formatting
and 1,470 tests across 174 files. Twenty opt-in browser tests in four files were
skipped. Worker concurrency was limited through CPU affinity, without changing
test settings. An earlier unrestricted run hit two PGlite setup timeouts under
CPU oversubscription; the complete bounded suite passed.

Regressions cover catalog parity and placeholders in every locale, static
markup and lazy-template coverage, Czech aliases, pause/payment/quota messages,
unknown errors, validation, remounts, native file-drop types and real IndexedDB
draft editing. Saving a Dutch, French or Czech draft preserves the seller's
literal title and the ASCII edit-telemetry field names. The payment/recovery,
seller-note and remount fixes were observed failing before their implementation.

Browser QA used the built application and a local fixture server. Supabase,
usage, email, generation, checkout and phone-upload calls were intercepted.
The fixture selected English title output and French description output while
changing the UI locale, deliberately exercising their independence.

The mobile matrix contains 144 rendered screens at 390 by 844 pixels:

| Surface                             | Locales |
| ----------------------------------- | ------: |
| Pause dialog and generation failure |      18 |
| Sign-in                             |      18 |
| Listing-style onboarding            |      18 |
| Standalone phone uploader           |      18 |
| Sign-in callback recovery           |      18 |
| ChatGPT handoff                     |      18 |
| Draft settings                      |      18 |
| Photo editor                        |      18 |

Snapshots and screenshots were inspected for untranslated application copy and
layout problems. Pause dialogs fit the mobile viewport in every locale.
The settings scan's Dutch `Your drafts` match is deliberately typed seller-note
content and remains unchanged. The original mixed-language pause reconstruction
is retained for the before/after comparison. It is not a historical screenshot
of the customer's actual device.

Additional Dutch desktop captures use 1440 by 1000 pixels for the editor,
settings and pause dialog. Dutch seller-note validation and payment recovery
were exercised separately.

## Evidence and limits

Final captures, full snapshots and the review contact sheets are saved under:

`C:/Users/Sami/.codex/visualizations/2026/11/02/01a19ccc-1ea4-7581-8a26-f64e3d7f1bd6/web-app-localization`

The fixture source, compact verification result and source hashes are in:

`/home/mests/projects/autolister/ops/evidence/web-app-localization-2026-11-02`

The checked screenshots use sample garment photos and mocked services. This is
not a certification of live OAuth, Stripe checkout, phone transfer, production
generation or every possible browser-native validation message. No native-speaker
review of all 18 catalogs is claimed. The owner authorized the guarded production
push after reviewing these results and previews.
