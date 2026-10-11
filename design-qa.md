# Seller Studio design QA, October 9, 2026

Latest first-frame correction: [opening, dismissal and startup QA](docs/qa/browser-drafts/performance-overlays.md#opening-dismissal-and-startup-correction). Small menus open immediately, sheets fade with their backdrops, header content remains visible, and saved flows restore without flashing the library. These frame checks supersede the earlier settled-only motion acceptance.

Latest rendering/overlay acceptance: [performance and overlay QA](docs/qa/browser-drafts/performance-overlays.md). It records measured DOM reductions, deferred hidden rendering, stable photo menus, responsive modal focus and repeated close/reopen cleanup.

Latest preparation/review acceptance: [item preparation polish](docs/qa/browser-drafts/item-preparation-polish.md), including directly editable fields, ten-photo handling, exact deletion thumbnails, stable generation and identical compact mobile action bars. This supersedes the earlier preparation/review layout below.

Latest October 11 acceptance: [mobile flow audit](docs/qa/browser-drafts/mobile-flow-audit.md), including short-phone fold visibility, pinned preparation/progress actions, save and photo recovery, sign-in recovery and the full flow walkthrough. Earlier records below are historical.

Current October 11 correction: [entry, settings and selection QA](docs/qa/browser-drafts/entry-polish.md). It covers compact and stable entry/manual flows, animated dialogs and scope switching, usable account counters, contextual batch settings, batch removal and confirmed bulk deletion. Earlier records below are historical.

Current correction: [layout stability and control polish QA](docs/qa/browser-drafts/presentation-polish.md). It covers header settings, consistent language flag artwork, photo-control proportions, normal/hover caption padding, fixed Create item actions, scrollbar width, selection and batch-progress geometry. The following settings repair record is retained as history.

The earlier visual acceptance below is withdrawn. The user exposed an unusably short settings panel in the empty composer, shifting Drafts/Listed actions, and a missing global settings entry. The earlier checks covered populated review settings but did not assert empty-composer panel geometry or toolbar stability across tab transitions. Passing those tests did not justify the blanket visual acceptance.

The correction uses the same `redesign-existing-projects` checklist and approved direction 1 typography, palette and photo hierarchy. Settings now use a viewport-contained dialog, with a persistent global Listing settings entry and separate item overrides. This replaces the earlier third-column/anchored settings presentation. Current correction evidence is recorded in [settings repair QA](docs/qa/browser-drafts/settings-repair.md).

## Earlier review, superseded for settings and toolbar

## Source and normalized comparisons

Source: `C:/Users/Sami/.codex/visualizations/2026/10/09/01a121c6-6c0a-71e3-98f8-d487c680bf74/autolister-design-concepts/direction-1-full-workflow.png`, 1448 x 1086 pixels. This generated board labels its conceptual frames 1440 x 1024 and 390 x 844; those labels are not reliable capture-density metadata. Desktop app crop: `(47, 82, 742, 606)`, 695 x 524 pixels. Mobile settings crop: `(436, 640, 675, 1068)`, 239 x 428 pixels.

Implementation: `http://localhost:4340/app/`, with the same build captured using isolated deterministic fixtures on port 4331. [Desktop reference](docs/qa/browser-drafts/seller-studio/reference-review-1440.png) has a 1440 x 1000 CSS viewport, deviceScaleFactor 1 and 1440 x 1401 full-page pixels. [Phone reference](docs/qa/browser-drafts/seller-studio/reference-review-390.png) has a 390 x 844 CSS viewport, deviceScaleFactor 1 and 390 x 1447 full-page pixels. These captures show English, Long, Bullet points, Standard, hashtags on, emojis off, note included and the same 39-character note. The real garment photograph and description match the source subject. One fixture photo replaces the source's four conceptual photos; photo-count handling is covered separately.

Combined inputs were opened and judged after the last visual fix:

- [Full desktop comparison](docs/qa/browser-drafts/seller-studio/source-review-comparison.png): source app crop and complete rendered page, each fit to 800 pixels wide. Different full-page heights are retained rather than stretched.
- [Focused settings comparison](docs/qa/browser-drafts/seller-studio/source-settings-focused.png): source crop `(511,125,729,592)` beside runtime `(950,255,1280,1292)`, each fit to 430 pixels wide.
- [Mobile comparison](docs/qa/browser-drafts/seller-studio/source-mobile-comparison.png): source settings crop beside the first 844 CSS pixels of the 390-pixel runtime capture, both 390 pixels wide.

These compare layout and product hierarchy, not pixel identity. The source's tiny generated controls are replaced by actual 44-pixel targets and legible inputs. Desktop settings occupy normal document flow. Mobile settings scroll internally with a fixed heading, close control and Done. The source's extra blue outlines, duplicate tone-option helper and long copy labels were simplified following the user's instruction to remove low-value text and use useful icons. Drafts/Listed navigation appears in the library; review uses a contextual back label. These are accepted implementation and accessibility differences.

## Findings and correction history

All actionable findings below were corrected and rechecked:

1. P1, complete settings: the earlier implementation exposed only languages, length and format, and forced generation extras off. Shared controls now include tone, hashtags, emojis, independently included seller note and account-scoped device defaults. Contract and generation tests verify backwards-compatible old drafts and exact provider payloads.
2. P1, note correction: changing an invalid note validated the old invalid value first, preventing correction. The input path now replaces the note before validating. Browser regression checks invalid generation blocking and successful correction.
3. P2, desktop composition: expanded settings overlaid the page/footer. They now occupy the third grid column, with footer below the full workspace. The full desktop comparison confirms no collision.
4. P2, phone action order: pre-generation photos and grouping completion pushed the primary action too far down. Photos are compact before generation and completed grouping places item rows and Generate before secondary completion actions. Phone single-ready and batch-ready captures confirm the order.
5. P2, mobile errors: invalid notes and failed batch-setting saves had feedback below a clipped area or behind an inert sheet. Errors now appear inside the settings body; invalid Done is disabled. Post-fix [note error](docs/qa/browser-drafts/seller-studio/studio-note-invalid-390.png) and [batch save error](docs/qa/browser-drafts/seller-studio/studio-batch-settings-error-390.png) show visible guidance.
6. P2, tablet settings: an anchored settings panel extended below the viewport. Its height is now bounded to available space, with internal scrolling and a persistent Done control. Final 768-pixel reference and state matrix show the bounded panel.

The earlier claim that no P0, P1 or P2 visual findings remained was disproved by the user's empty-settings and tab-transition screenshots. Use the correction record above for current acceptance. Physical-device and live-service coverage limits below remain unverified.

## Required surface review

| Surface            | Evidence and acceptance                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography         | Self-hosted Geist body and Newsreader display headings, preserved wordmark, clear title/body/support hierarchy. Long descriptions wrap without horizontal overflow.                                       |
| Layout and spacing | Shared gutters and spacing, 4/3/2 library columns, left-aligned headings, bounded photos, visible copy actions, consistent row alignment. Settings use internal scroll where necessary.                   |
| Colors             | Warm neutral canvas, white working surfaces, one restrained blue accent, semantic error/save status colors. Browser check confirms text palette contrast of at least 4.5:1 on white.                      |
| Images             | Real clothing fixtures, deliberate contained review crop, cropped library/pool tiles, no unrelated demo imagery. Decode/upload errors have recovery actions.                                              |
| Copy and icons     | Short action labels, settings icons on batch rows, copy icons beside fields, waiting/running/error/ready queue cues. Icon-only controls retain accessible names. Constraint and failure guidance remains. |
| Interaction        | Keyboard selection, focus containment, Escape and focus restoration, 44-pixel phone primary/copy controls, autosave acknowledgement, reduced motion, pause/resume and navigation recovery.                |

## Coverage and limits

The full browser journey, full-settings case, UI accessibility case and six existing review regressions pass. The capture matrix covers 46 named states across 360, 390, 768 and 1440 CSS pixels (178 captures, including 200% CSS zoom). All 16 contact boards were visually reviewed; the final settings fixes were recaptured at every width. [Coverage record](docs/qa/browser-drafts/seller-studio/capture-coverage.json), [journey assertions](docs/qa/browser-drafts/seller-studio/result.json), [settings assertions](docs/qa/browser-drafts/seller-studio/full-settings-result.json), [accessibility assertions](docs/qa/browser-drafts/seller-studio/redesign-result.json).

[Desktop entry before/after](docs/qa/browser-drafts/seller-studio/before-after-entry-desktop.png) uses matching 1440 x 1000 CSS viewports from the preceding iteration and Seller Studio. [Phone entry before/after](docs/qa/browser-drafts/seller-studio/before-after-entry-mobile.png) uses matching 390 x 844 CSS viewports, with full-page content heights 844 and 890 pixels. Both show empty single-item preparation. They are labelled before/after, not as source fidelity comparisons.

The full raw captures are preserved in `C:/Users/Sami/.codex/visualizations/2026/10/09/01a121c6-6c0a-71e3-98f8-d487c680bf74/autolister-seller-studio/responsive-qa-evidence.zip`. Coverage paths name members of that archive, not disposable temporary files.

Covered: sign-in and code states, empty/loading/list retry, populated library and Listed, single upload/preparation/generation, grouping and completion, all writing options, included/excluded note, per-item overrides, batch inheritance, queue pause/resume, provider failure, quota, save retry, conflicts, reload recovery, menus/sheets, long content, reduced motion and CSS zoom. Generation/auth/billing are deterministic fixtures. Provider-generated copy quality and live entitlement behavior are not established by fixture screenshots.

Unverified: physical iOS/Android devices, native camera/HEIC picker behavior, real browser 200% zoom (CSS zoom was checked), OS virtual keyboards, live auth delivery, billing, production generation and live marketplaces. No deployment or publishing occurred.

Release gate is recorded in [the implementation ledger](docs/qa/browser-drafts/seller-studio-progress.md).

The implementation checklist is complete for the local scope: complete settings, single/batch flows, useful icons and concise copy, responsive surfaces, failure recovery, visual comparison and the production gate. The explicit integration/device coverage limits remain recorded above.

Final result: passed

---

# Historical Mobile web Phase 1 design QA

## Comparison evidence

- Source visual truth: `C:\Users\Sami\.codex\codex-remote-attachments\01a0b8e8-3a38-7a80-bfa1-acd5508a7c59\FD59C37C-4142-4476-ADF2-5843A07AAF1C\1-Photo-1.jpg` (720 x 1280 JPEG, 72 dpi).
- Runtime implementation commit: `2822db7` (`fix: style runtime mobile photo tiles`).
- Runtime idle captures:
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-390-idle.png` (390 x 844 pixels, 390 x 844 CSS px at deviceScaleFactor 1).
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-412-idle.png` (412 x 915 pixels, 412 x 915 CSS px at deviceScaleFactor 1).
- Runtime interaction captures:
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-390-photo-selected.png` (390 x 844 pixels).
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-390-generating.png` (390 x 844 pixels).
- Earlier interaction evidence retained from the same shell before the tile-only fix:
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-followup-390-profile-open.png` (390 x 844 pixels).
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-followup-390-result.png` (390 x 844 pixels).
- Full idle side-by-side comparison input: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-qa-idle-comparison.png` (1350 x 1010).
- Focused source and idle comparison input: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-qa-focused-comparison.png` (1440 x 950).
- Runtime interaction comparison input: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-runtime-qa-interactions.png` (1180 x 680). It places the normalized source app crop beside selected-photo and generating states.
- Source app-owned crop used for normalization: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-followup-source-app-owned.png` (672 x 1150, source crop x=24, y=84, width=672, height=1150).

The source is a framed mobile mockup without reliable CSS density metadata. Bezel, status area, and home-indicator area were excluded from fidelity judgment. The full composite retains the source frame for traceability; the app-owned and focused composites are the judgment inputs. The dark partial strip at the absolute bottom of the runtime captures is capture-tool/browser chrome outside the app-owned surface and is explicitly excluded, not filed as a product mismatch.

The runtime quota is account-driven and differs from the static source visual: source Day 0 / 5, Month 0 / 50, Extra 17; runtime Day 8 / 10, Month 30 / 50, Extra 4. The values remain within their cards without overflow, so this is recorded as an accepted dynamic-state variance rather than a layout defect. All other idle content uses the same initial empty listing state: English title and description, Long plus Bullet points, no selected photo in idle, disabled Generate CTA, and helper copy.

## Runtime and interaction evidence

- Idle 390 and 412: source order and hierarchy remain intact from header through quota, photo card, language controls, description style, CTA, and helper.
- Photo selected: the new runtime capture shows a valid decoded thumbnail at 68 x 68 and an overlaid remove control at 44 x 44. The tile stays inside the photo rail and no horizontal overflow is visible.
- Generating: the same thumbnail/remove geometry remains stable while the progress card, status copy, Cancel action, and disabled Generate CTA render. No overlap or horizontal overflow is visible.
- Profile open and result: earlier captures from the same shell show the profile menu bounded inside the viewport and the result card continuing naturally below the initial viewport. The tile-only runtime fix does not change those surfaces.
- Runtime metrics supplied with the capture run: thumbnail 68 x 68, valid decoded image, remove control 44 x 44, no horizontal overflow, no console errors, and 90 files / 575 tests verified. This report does not rerun the test suite.

## Findings

No actionable P0, P1, or P2 findings remain in the supplied idle and interaction states.

- [P3] Description-style icon is visually different from the source's outlined document icon.
  Location: `src/components/mobile-web/ListingControls.astro:176-180` and `.mobile-format-summary-icon` in `src/styles/mobile-web-app.css:782-806`.
  Evidence: the source shows an outlined document with internal lines; the implementation uses the existing approved `format-icon-para` markup as visible horizontal lines in the pale tile.
  Impact: minor icon-family fidelity drift only. The approved existing icon is legible, communicates the same control, and does not affect tap target or hierarchy.
  Fix: only if a separate approved outlined-document asset becomes available, swap it while preserving the current contrast. Do not block this handoff on the P3 difference.

- [P3] Runtime quota copy differs from the static source fixture.
  Location: usage values in the quota card.
  Evidence: source shows 0 / 5, 0 / 50, and 17; runtime captures show 8 / 10, 30 / 50, and 4. Both variants fit the same layout and preserve the intended hierarchy.
  Impact: account-state copy variance, not a visual or interaction failure.
  Fix: use a deterministic 0 / 5, 0 / 50, 17 fixture only when exact source-copy parity is required for a design snapshot. Preserve live account metrics in product behavior.

## Open questions

- Confirm whether future pixel-diff runs should use a deterministic quota fixture or the live runtime account state. No responsive or overflow issue is caused by the current values.
- The raw console log is not included in the PNG artifact set. The runtime handoff explicitly reports no console errors, and no error overlay is visible in any capture.

## Comparison history

1. Pass at `506241f`: blocked by P1/P2 idle mismatches. The sticky Generate panel covered the description-style row at 390 px and pushed helper copy below the viewport; gallery copy wrapped; the photo card was too tall; the camera lens disappeared into the blue body; and the description-style icon appeared blank.
2. Fix at `9cbd4f1`: compact mobile rules reduced card density, set photo actions to no-wrap, switched the mobile CTA to normal flow through 430 px, added a contrasting camera lens, and rendered a visible format icon. Idle comparison then had no P0/P1/P2 findings, with P3 icon, footer, and optical differences.
3. Fix at `ab924d3`: moved the disclaimer below the initial fold and reused the existing approved `format-icon-para` markup. The 390 and 412 idle captures passed hierarchy and clipping checks.
4. Pass at `ab924d3` interaction QA: profile-open, generating, and result surfaces were bounded, but selected-photo and generating exposed a P1 dynamic tile styling defect because runtime-created nodes lacked scoped PhotoRail styles.
5. Fix at `2822db7`: added unscoped global runtime tile, image, remove-button, compact rail, and focus styles. The runtime captures now show the valid 68 x 68 thumbnail and 44 x 44 remove control. Current recheck finds no P0/P1/P2 mismatch. The remaining icon and quota differences are P3 only.

## Required fidelity surfaces

- Fonts and typography: source and runtime hierarchy, wrapping, and interaction copy remain legible. No new clipping or truncation issue is visible.
- Spacing and layout rhythm: idle cards, controls, CTA, helper, selected thumbnail, remove control, progress card, and result continuation keep stable spacing.
- Colors and visual tokens: source and runtime blue, navy, pale icon tiles, dashed border, disabled CTA, progress surface, and result surface map closely.
- Image quality and asset fidelity: camera, gallery, globe, and selected thumbnail are sharp and legible. The approved format icon remains a P3 shape difference.
- Copy and content: core source copy matches. Quota values are live account data and are recorded as a P3 state variance. The legal disclaimer remains below the initial fold.
- Responsiveness and accessibility: 390 and 412 idle states have usable controls, single-line gallery copy, no horizontal overflow, and visible helper text. Runtime metrics confirm 68 x 68 thumbnail and 44 x 44 remove target. Bottom capture chrome is excluded from app-surface judgment.

## Implementation checklist

- [x] Open source and runtime idle captures and compare them together in a full-view composite.
- [x] Create and inspect focused photo/control comparison after removing source device chrome.
- [x] Recheck selected-photo and generating interaction states after the runtime tile fix.
- [x] Verify thumbnail size, decoded image, remove target size, horizontal overflow, and console-error status from the supplied runtime metrics.
- [x] Verify prior profile menu and result evidence remains bounded and naturally scrollable.
- [x] Document quota state variance and exclude capture-tool bottom chrome from fidelity findings.
- [x] Record the supplied 90 files / 575 tests release verification without claiming a rerun.
- [ ] Optional P3 polish: align the format icon artwork if a separate approved asset becomes available; no release block.

final result: passed
