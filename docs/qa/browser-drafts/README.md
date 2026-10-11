# Browser draft QA evidence

October 9, 2026. Feature branch: `codex/mobile-web-phase1`.

## Current MVP storage

October 11: [browser-local storage acceptance and launch limits](local-storage.md).
Drafts and prepared JPEGs now stay in account-scoped browser storage. Existing
temporary uploads, generation limits and cleanup are reused. Earlier cloud
draft-table and permanent-bucket requirements below are historical.

## Current rendering and overlay performance

October 11 follow-up: [opening, dismissal and startup correction](performance-overlays.md#opening-dismissal-and-startup-correction). Frame-level checks catch the delayed Add new fade, coordinated backdrop dismissal, preserved header/logo and wrong-screen startup flashes. These supersede the earlier motion timings.

October 11: [measured rendering reductions and overlay QA](performance-overlays.md). Idle clicks and note edits cause zero dropdown mutations. Editing retains the photo grid and defers the hidden library. Repeated opening/closing, scope changes, keyboard controls and rapid account reopening are covered by regression checks.

## Current preparation and review polish

October 11: [item preparation, direct editing and fixed action QA](item-preparation-polish.md). This pass covers ten-photo grids, exact deletion previews, one photo-source button, a stable generation spinner, lean review/header spacing, long editable descriptions and matching compact mobile action bars without helper text. The follow-up prevents unnecessary scrolling on seven short screens at four widths, including the preview banner. Earlier preparation/review layouts below are historical.

## Current mobile flow pass

October 11: [mobile flow audit and corrections](mobile-flow-audit.md). Short 360/390px phone checks now cover visible review controls, pinned single/batch generation and progress, save retry, unobstructed photo recovery and sign-in code recovery. Four-width visual evidence, the complete journey, twelve regression cases and the production gate are recorded with device limits. Earlier records below are historical.

## Current entry, settings and selection polish

October 11: [current QA and coverage limits](entry-polish.md). This pass covers compact photo entry, stable manual writing, animated settings/account surfaces, smooth settings scope changes, batch settings without navigation, one-button batch removal, whole-card selection and confirmed bulk deletion. The full journey and eleven regression cases pass. The production gate passes 116 files / 828 tests. Earlier sections retain historical results.

## Current layout stability and control polish

See [current QA and limits](presentation-polish.md). Global settings is now in the header. Photo controls and caption padding are corrected, language names have self-hosted flag artwork, and fixed Create item actions remain visible. Four-width geometry checks cover tabs, selection, hover, first grouping and batch progress. The full browser journey and ten regression cases pass. The production gate passes 116 files / 828 tests. Earlier sections below retain historical results.

## Current Seller Studio redesign

The earlier settings/toolbar acceptance was incorrect and has been withdrawn. See [settings repair QA](settings-repair.md) for the user-reported defects, corrected global defaults/dialog behavior, and focused regression evidence. The results below describe the preceding iteration.

The approved editorial direction is implemented with full writing settings, saved defaults, per-item batch overrides and automatic generation after grouping. Useful Lucide icons replace repetitive action text; failure and constraint guidance remains visible. The latest coverage and limits are in [the implementation ledger](seller-studio-progress.md) and [root design QA](../../../design-qa.md).

Final production gate: lint, types, feature-enabled 132-page build, formatting and **116 files / 828 tests passed**. The full draft browser suite and all eight acceptance/regression cases pass. Source reference captures also pass.

Final local evidence: [overview](seller-studio/seller-studio-overview.png), [source comparison](seller-studio/source-review-comparison.png), [phone settings](seller-studio/reference-review-390.png), [mixed batch](seller-studio/studio-batch-ready-390.png), [queue](seller-studio/studio-batch-running-390.png), [coverage](seller-studio/capture-coverage.json). The older sections below retain historical results.

## Current calm seller workspace

The user-approved UI redesign uses Geist, a shared neutral/blue system, compact library navigation, a composed entry view, explicit grouping completion and a focused review workspace. Mobile account/settings/photo sheets have focus containment, inert backgrounds and cleanup after photo corrections. Desktop photo menus stay within the viewport.

The production gate passes 115 files / 817 tests. The full deterministic browser journey, the redesign acceptance case and six existing review regressions pass. Fresh evidence covers 360, 390, 768 and 1440 CSS pixels, including loading, upload/generation progress, auth, retry, recovery, conflict and quota. [Acceptance and limits](ui-redesign-progress.md), [browser result](ui-redesign/result.json), [redesign result](ui-redesign/redesign-result.json).

- Entry: [desktop](ui-redesign/empty-1440.png), [phone](ui-redesign/empty-390.png).
- Review: [desktop](ui-redesign/editor-1440.png), [phone](ui-redesign/editor-390.png).
- Grouping completion: [desktop](ui-redesign/redesign-grouping-complete-1440.png), [phone](ui-redesign/redesign-grouping-complete-390.png).
- Settings: [phone](ui-redesign/redesign-settings-390.png). Photo options: [tablet](ui-redesign/redesign-photo-options-768.png).

## Listing preparation redesign

The accepted plan is implemented as add item → generate → review/copy → manually Listed. The [storyboard](storyboard.html) preceded the markup change. Photos stay visible, review text is readable until Edit, grouping retains created groups, and authentication/account/settings use compact contextual controls. No database migration or API contract change was introduced by this redesign.

The final production gate passes lint, types, the feature-enabled build (132 pages), formatting and **115 files / 817 tests**. The [final browser result](listing-preparation/result.json) records **44 checks**, no page errors and no overflow at 360, 390, 768 and 1440px. Six additional review regressions pass: Listed retry, delayed detail after Back/closing grouping, later-page batch review, library scroll restoration and failed sign-out. Keyboard controls, focus return, 44px phone targets, palette contrast and 200% CSS zoom were checked. [Detailed evidence and limits](redesign-progress.md).

- Home: [phone](listing-preparation/home-empty-390.png), [populated desktop](listing-preparation/library-1440.png).
- Preparation and grouping: [phone composer](listing-preparation/empty-390.png), [desktop grouping](listing-preparation/grouping-1440.png), [created groups on phone](listing-preparation/grouped-390.png).
- Review: [phone](listing-preparation/editor-390.png), [desktop](listing-preparation/editor-1440.png).
- Contextual controls: [settings sheet](listing-preparation/settings-390.png), [desktop settings](listing-preparation/settings-1440.png), [account sheet](listing-preparation/account-390.png).
- Authentication: [sign-in](listing-preparation/auth-390.png), [code entry](listing-preparation/otp-390.png), [code failure](listing-preparation/otp-error-390.png).
- Recovery: [save failure](listing-preparation/save-error-390.png), [cross-device conflict](listing-preparation/conflict-390.png).

Captures use sample product photographs and isolated fixture accounts. The full matrix is `/tmp/autolister-redesign-final-browser` for this session. Physical phones, staging integrations, live auth/billing and real browser zoom remain unverified; nothing was deployed.

## Earlier UI review

### Bulk upload and Listed follow-up

The empty bulk view now has one photo-upload target. Grouping instructions, the photo grid and collapsed language/style settings appear after photos arrive. Creation actions appear after selection; the separate-item alternative appears only for multiple selected photos. Repeated photo-option captions became accessible overflow menus. The installed Inter Variable font and workspace ink color are applied explicitly. The heading and back control stay in view when opening bulk upload.

Mark as listed is available before generation for items with photos, as well as for generated or written text. It moves the item into a separate Listed bucket, persists through reload, and has a Move back to drafts action. This changes the existing saved status; it does not publish to a marketplace.

The final production gate passed **115 files / 815 tests** (test run began October 9 at 14:11:45 Europe/Amsterdam), plus lint, types, feature-enabled build and formatting. The final browser suite passed **28 checks**, with no page errors and no horizontal overflow at 360, 390, 768 and 1440 pixels; [result](bulk-result.json). It checks the native file chooser, empty/uploaded/selected stages, grouped and individual creation, and both photo-only and generated Listed/restore paths, alongside the existing save, conflict, recovery and batch journeys. The complete matrix is `/tmp/autolister-drafts-bulk-browser` in this session. Selected final screenshots below were visually inspected.

- Empty upload: [desktop](bulk-empty-1440.png), [phone](bulk-empty-390.png).
- Selected photos: [desktop](bulk-grouping-1440.png), [phone](bulk-grouping-390.png).
- Listed bucket: [phone](listed-390.png).

These captures use isolated fixture accounts and sample imagery. No customer or marketplace was used; real staged integrations and physical devices remain unverified.

### Earlier gallery and editor review

The user-requested redesign replaces the earlier form layout with a photo gallery, a focused editor and progressive disclosure. The final visual correction removes nested photo frames and the background wash, keeps one clean tile surface, and gives captions 16px desktop / 12px phone padding. Hover no longer adds a frame. The screenshots use existing prototype sample photos in a localhost fixture account. No customer data was used.

The fresh full gate passed 115 files / 815 tests at 13:47:19 Europe/Amsterdam. The updated browser suite passed 25 checks with no page errors; [current result](redesign-result.json). It covers initial disclosure/manual writing/deletion, leaving bulk import for a new draft, reusing an unstarted draft on repeated New draft clicks, and preserving started work with photos. Selected screenshots below were visually inspected; the full responsive capture matrix is `/tmp/autolister-drafts-clean-browser` in this session.

- Gallery: [desktop](redesign-gallery.png), [phone](redesign-gallery-phone.png).
- Editor: [desktop](redesign-editor.png), [phone](redesign-editor-phone.png).
- Follow-up sidebar correction: item buttons now align content to the left instead of centering each item according to its text width. The feature-enabled build passed; isolated Chromium confirmed identical thumbnail/text columns and 56px content heights at 768, 900 and 1440 pixels. The desktop editor screenshot above was updated and inspected. Physical devices were not used for this check.
- Additional upload, grouping, save-error, conflict, quota, batch and partial-failure states were captured at four widths by the browser suite. These screenshots establish local fixture behavior; real device and staged integrations remain unverified.

## Original implementation evidence

These are screenshots of the actual built application with isolated fixture accounts, photographs and intercepted provider/Storage responses. They establish local UI behavior, not a deployed customer journey or real-device support. No customer account or live marketplace was used.

The final production gate passed all stages: ESLint, TypeScript, feature-enabled Astro build (132 pages), repository formatting and 115 files / 814 tests. The tests include ten real PGlite migration cases and endpoint/client regressions. The complete browser fixture suite passed all 23 listed checks with zero page errors; see [result.json](result.json).

The browser captured and visually reviewed eight states at 360, 390, 768 and 1440 CSS pixels: empty, editor, grouping, active batch, save failure, conflict, quota and partial failure. No horizontal overflow was found. Screenshots settle animations before capture; keyboard focus is intentionally visible. Selected images are retained here; the full matrix remains at `/tmp/autolister-draft-final-browser` in the working session.

| State                                               | Captured application                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Empty composer                                      | [Phone](empty-390.png)                                                        |
| Saved editable draft                                | [Phone](editor-390.png), [tablet](editor-768.png), [desktop](editor-1440.png) |
| Explicit photo grouping                             | [Phone](grouping-390.png)                                                     |
| Sequential batch                                    | [Phone](batch-390.png)                                                        |
| Failed save with retry                              | [Phone](save-error-390.png)                                                   |
| Cross-device conflict with preserved edits          | [Phone](conflict-390.png)                                                     |
| Quota stop with saved drafts                        | [Phone](quota-390.png)                                                        |
| Partial failure with other completed items retained | [Phone](partial-failure-390.png)                                              |

Fresh review found three important defects and drove regression-tested fixes: delayed refresh could discard edits; session recovery lacked its saved base version; expired-upload cleanup could delete a renewed completed photo. Follow-up review confirmed these fixes, including the related same-item navigation race. Draft deletion also clears its text immediately and acknowledges committed deletion when Storage cleanup needs a later retry.

Unperformed release checks are listed in [the deployment handoff](../../browser-drafts-release.md): actual staging Supabase/Storage/provider/auth integration, multi-connection PostgreSQL concurrency and physical iOS/Android camera, HEIC, keyboard and clipboard behavior. Nothing was deployed, pushed to main or applied to production.
