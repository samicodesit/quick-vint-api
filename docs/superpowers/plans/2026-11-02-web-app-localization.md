# Seller web app localization

## Scope and design

Localize the complete seller web app in its existing 18 languages: en, fr,
cz (BCP 47 cs), da, nl, de, el, hr, fi, hu, it, lt, pl, pt, ro, es, sk, sv.
The browser language list selects interface language. Listing output language
remains independent. Unknown browser languages fall back to English. Reuse the
existing onboarding, model and billing catalogs; add a typed catalog for the
remaining workspace, auth, photos, billing explanations and errors.

Use explicit translation calls for dynamic copy and localize initial static
shell/template content before mounting. Never translate user titles,
descriptions, seller notes, filenames, emails, API enums or telemetry. Preserve
the compact layout and existing workflows. No production deployment is
authorized by this task. The browser extension is explicitly out of scope.

## Implementation plan

1. Add failing regressions for translated pause/payment/quota messages and
   interface-language selection independent of listing language.
2. Inventory visible strings and accessibility attributes, add complete
   catalogs and wire all dynamic render boundaries, dialogs, validation and
   static templates. Cover callback, photo editor, QR and model-photo controls.
3. Add completeness, placeholder and source-coverage checks. Exercise auth,
   onboarding, settings, drafts, partial import, generation failure, paywalls,
   photo editor and accessibility labels in all supported locales.
4. Run targeted regressions, the production verification gate, and a separate
   self-review. Capture mobile/desktop affected screens and report remaining
   limitations. Keep this work local pending deployment approval.

## Review focus

- Czech regional aliases and unsupported primary browser languages.
- UI locale independent of title/description selections and stored drafts.
- Preserving user-authored text and API/analytics enum values.
- Dynamic counts, plurals and escaped user values in dialogs and labels.
- Errors, lazy dialogs, templates and accessible names, not only happy paths.

## Progress

- Confirmed root cause: independent partial catalogs coexist with hard-coded
  English workspace and paywall copy. Existing main checkout is clean apart
  from its pre-existing node_modules symlink and is reused for this change.
- Execution is inline under the user's routing policy. Review will be a
  separate self-review; no delegated reviewer is authorized.
- Implemented the shared UI catalog, static initialization, dynamic copy and
  standalone upload runtime across all 18 locales. Regression coverage preserves
  user data, native protocol values and telemetry field names.
- Completed the 144-screen mobile matrix, Dutch desktop previews and inline
  review. Long photo-tool labels now wrap within the mobile viewport.
- The full production verification gate passed with 1,470 tests and 20 opt-in
  tests skipped. Detailed evidence and limits are recorded in
  `docs/qa/web-app-localization-2026-11-02.md`. The owner subsequently authorized
  the guarded production push.
