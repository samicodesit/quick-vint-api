# Model photo status and consent

Approved scope: add a quiet explanation when an enabled model cannot be used for an item, and label the creation action "Create and enable". Keep existing progress, failure and retry UI. No new banner, modal, toggle, tracking event, legal disclaimer or paid request.

Approach: reuse the shared photo-status renderer and canonical model translations, mirror them into the extension. Unsupported items get one neutral terminal message without placeholders or retry. Disabled and cancelled operations remain hidden. Preserve the optional onboarding preferences step, which does not itself create a model.

## Implementation plan

- [x] Add failing behavioral coverage for skipped status, locale coverage and explicit creation action.
- [x] Update shared components and all 18 UI languages, synchronize extension assets.
- [x] Exercise actual web workspace and extension listing screens with local API fixtures: off, skipped, loading, failure, retry and creation. Inspect wrapping at desktop and mobile widths.
- [x] Run both project suites and production build checks. Review the complete diff and preserve concise visual evidence. Leave release actions unperformed.

Review focus: no status for opted-out users; no spinner or retry on unsupported items; clear distinction between saved-model creation and listing-photo creation; long translations fit existing controls; no changes to backend model enablement or billing.

## Implementation decisions and evidence

- The optional preferences step uses the same explicit creation label. It still saves the choice until sign-in and remains skippable. Authentication and creation timing are unchanged.
- Web terminal notices sit at the top of the photo area, directly above the photos. Unsupported-item status uses the existing Lucide style's UserRoundX icon. In the extension, that status sits directly beneath the model controls with an 8 px gap. Pending photos retain their thumbnail placeholders. Browser regressions check placement and cleanup when opening a fresh draft.
- The creation action stays on one line in every supported locale. Mobile forms use a full-width primary action with the optional skip action centered underneath. Desktop retains the existing action row.
- The standing instruction against asking users to reorder photos applies to the existing ordering failure. Its message now reports that photos were added but could not be placed first. Upload and ordering diagnostics remain unchanged.
- Loading the complete extension toolbar exposed a real click obstruction: the photo-button anchor scanner treated our progress message as a native photo heading and overlaid Retry. Exclude the owned progress area from candidate host headings. Native ordering, partial upload retry and order-failure scenarios pass with the complete toolbar enabled.
- Native heading proximity excludes space occupied by our status and fallback upload action. This prevents loading or error rows from forcing Add photos below the photo area. A regression checks alignment with Photos to within 2 px at 1366 and 390 px during an upload failure, plus recovery when the host has no heading.
- Eighteen model flow checks pass against the local web server and extension components, including optional onboarding, language preference, seller-note preservation and toggling. The optional web test fixture accepts the local Supabase project reference instead of assuming a different test project.
- All 18 creation translations fit on one line at 320, 390 and 1366 pixels. Skipped status translations fit in the extension listing at desktop and mobile widths. Czech locale aliases remain supported.
- Canonical model copy and the photo-status module are mirrored across clients. Existing unrelated differences in the clients' model UI tracking were preserved.
- No new analytics events, fonts, dependencies, paid AI calls, marketplace uploads or production changes.

Final preview boards use the `-refined.png` suffix in the owner's private visualization folder `model-photo-status-20261104`. The extension host is a reconstructed Vinted form fixture, with Photos above item details, the native upload tile and the actual new-form label structure. The packaged extension modules render the toolbar, model dialog and status. This is not a live marketplace verification.

## Verification

- Backend `npm run verify:production`: passed, including 1,555 tests. The standard gate skips 22 opt-in browser tests. The separate first-use browser run passed eight checks, and the listing-photo browser journey passed with local responses and retained real assets.
- Extension `AUTOLISTER_API_PATH=<this backend checkout> npm test -- -- --workers=4`, followed by `npm run build:prod`: 173 unit tests and 445 browser tests passed; 13 optional checks skipped. The explicit model/web browser run passed 18 checks. The default sibling shortcut pointed to an old backend checkout, so the coordinated run uses the explicit current path.
- After the final heading-spacing fix, all four photo upload/order/recovery scenarios passed again. The complete toolbar/tour suite passed all 20 checks. Creation layout passed in all 18 languages at 320, 390 and 1366 px with a one-line action.
- Review performed inline under the workspace routing policy. No remaining findings in this UI scope. Production delivery, store submission and a fresh live marketplace check were not performed.
