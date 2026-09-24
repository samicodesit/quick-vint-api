# Mobile web Phase 1 design QA

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
