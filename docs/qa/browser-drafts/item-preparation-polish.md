# Item preparation and review polish

October 11, 2026. Local feature branch `codex/mobile-web-phase1`. This record supersedes the earlier preparation/review layout in the mobile flow audit.

## Accepted behavior

- Preparation has no Cover badge, duplicate writing action or premature Mark as listed. Desktop thumbnails fill the cover width. The mobile two-column grid fills the available width and scrolls within the space above the pinned action when there are ten photos.
- Saved sits below the mobile title. One Add photos button sits to its right. Handset detection opens the native image chooser without forcing camera capture. Narrow desktop previews offer Photo library and Camera from that button.
- Photo deletion shows the selected photo rather than the cover. The dialog and action say Delete.
- Single generation remains in the preparation view. The disabled button displays a spinner and Generating, without a queue panel flash. Photo scroll position is preserved. Generate also stays disabled until upload processing finishes.
- Review is directly editable, with each label and Copy action on one row and its value below. Title and description use the same normal-weight 16px text. Description height follows its content and width, allowing ordinary page scrolling instead of a second textarea scrollbar.
- The mobile Generate, Generating and Mark as listed bars have identical bounds. Each contains only a 48px button, 4px top/bottom padding, safe-area allowance and a 1px border. At zero safe-area inset the whole bar is 58px high. The single-generation helper and publishing helper are absent. Batch generation still shows its usage count.
- The page reserves only enough clearance for the fixed action. At the end of a long description, the form ends within 8px above the bar. Header controls have equal vertical padding and aligned centers.

### Follow-up: leaner field and heading spacing

The review card now uses 12px padding on phone and 16px on desktop. Field-heading rows have no added bottom margin, the title field is 44px tall with an 8px gap before Description, and the description has no extra trailing margin. Copy controls retain their existing touch targets. Mobile preparation and review share an 8px navigation-to-title gap and 8px title-to-content gap. One-item and several-item entry controls retain equal vertical positions. The fixed bottom bars are unchanged.

Fresh follow-up checks cover mobile usability, item preparation, entry polish, presentation polish and the complete browser journey, plus the feature-enabled build and whitespace check. Discovered 4px entry-mode and manual-typing mismatches were corrected before acceptance.

### Follow-up: avoid unnecessary page scrolling

The body fills the viewport with a flexible shell rather than reserving a second full viewport below the preview banner. Empty batch entry no longer reserves 112px for absent batch actions. Draft screens remove unused view/footer padding, and focused mobile preparation/manual/review screens omit the legal footer while the library and entry screens retain it. A later footer rule was also reduced so it cannot restore the old spacing.

The new viewport-fit regression tests empty Drafts, one-item entry, several-item entry, empty manual entry, one-photo preparation, empty Listed and sign-in at 360, 390, 768 and 1440px, with the actual wrapping preview-banner copy. Phone height is 640px. Each short page must fit vertically and horizontally. The previous layout failed with a 675px page in a 640px viewport. The empty description starts at four rows, then expands with content, instead of reserving eight empty rows. Long review text, populated libraries and large photo sets remain scrollable, with their existing recovery and final-content-clearance checks.

Starting a fresh item clears the previous manual-writing intent, including when an empty draft is reused. This prevents empty writing fields from leaking into a new photo-preparation view. Fourteen browser regression cases, the complete journey and 116 files / 828 unit tests pass during this follow-up. The final footer correction was rechecked in the viewport-fit, mobile usability, preparation, entry and presentation cases. The clipboard fallback journey had one focus timeout during the parallel pass and passed on an isolated rerun; no copy behavior was changed.

## Verification

The deterministic Chromium tests cover 360, 390, 768 and 1440 CSS pixels, including 640px-high phone viewports. They assert both button and whole-bar geometry through generation, spinner visibility, preserved photo scrolling, ten-photo layout, exact deletion target, native chooser branching, direct editing, autosave, responsive textarea height and final-line clearance.

The complete browser journey, thirteen regression cases and an additional handset-UA preparation case pass. The regression cases are mobile usability, item preparation, entry polish, presentation polish, settings layout, full settings, UI redesign, pages, scroll, navigation, grouping navigation, Listed retry and sign-out. Local fixtures exercise errors and recovery without external generation or customer data.

Lint, TypeScript, formatting, the feature-enabled 132-page build and 116 test files / 828 tests pass. `git diff --check` passes.

The pass exposed and corrected an SVG hidden-attribute mistake, a stale publishing-helper reference, duplicate page clearance and a Generate-enabled timing gap during the final photo save. The phone handoff regression now passes after that timing fix.

## Evidence

- [One photo on phone](item-preparation-polish/one-photo-360-fold.png) and [ten photos on desktop](item-preparation-polish/ten-photos-1440.png).
- [Photo source menu](item-preparation-polish/photo-source-390-fold.png) and [correct deletion thumbnail](item-preparation-polish/delete-photo-390-fold.png).
- [Generating](item-preparation-polish/mobile-single-running-390-fold.png) and [directly editable review](item-preparation-polish/generated-review-390-fold.png).
- [Long description at the page end](item-preparation-polish/long-description-bottom-360.png).
- [Several-item entry without overflow](item-preparation-polish/fit-batch-entry-390.png), [empty manual fields](item-preparation-polish/fit-manual-entry-360.png) and [sign-in without overflow](item-preparation-polish/fit-sign-in-360.png).
- [Viewport measurements for seven screens at four widths](item-preparation-polish/viewport-fit-result.json).
- [Preparation results](item-preparation-polish/item-preparation-result.json), [mobile usability results](item-preparation-polish/mobile-usability-result.json), [native chooser branch](item-preparation-polish/native-result.json) and [complete journey](item-preparation-polish/journey-result.json).

## Limits

Handset UA and touch emulation check the chooser contract, not physical Safari/Android camera UI. Physical device keyboards, real browser chrome, safe-area hardware, live authentication, billing and generation providers remain unverified. Nothing was published or deployed. A short page leaves unused viewport space above a deliberately fixed bottom action; it does not add scrollable filler below the form.
