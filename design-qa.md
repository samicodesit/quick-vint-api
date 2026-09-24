# Mobile web Phase 1 design QA

## Comparison evidence

- Source visual truth: `C:\Users\Sami\.codex\codex-remote-attachments\01a0b8e8-3a38-7a80-bfa1-acd5508a7c59\FD59C37C-4142-4476-ADF2-5843A07AAF1C\1-Photo-1.jpg`.
- Implementation commit: `9cbd4f1` (`fix: compact mobile listing viewport`).
- Implementation screenshots:
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-final2-390.png`
  - `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-final2-412.png`
- Full side-by-side comparison input: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-final2-qa-comparison.png` (1350 x 1010).
- Focused side-by-side comparison input: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-final2-qa-focused.png` (1440 x 1000). It compares the photo card and the controls/CTA regions together.
- App-owned normalized comparison input: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-final2-qa-app-owned.png` (1320 x 1000). The source crop removes the visible bezel, status area, and home-indicator area before the side-by-side comparison.
- Source app-owned crop used for normalization: `C:\Users\Sami\AppData\Local\Temp\autolister-mobile-phase1-final2-source-app-owned.png` (672 x 1150 crop from source pixels x=24, y=84, width=672, height=1150).

Source pixels are 720 x 1280 JPEG at 72 dpi. The source is a framed mobile mockup without reliable CSS density metadata, so the bezel, status bar, and home indicator were excluded from fidelity judgment. The implementation PNGs are 390 x 844 and 412 x 915 pixels, treated as 390 x 844 and 412 x 915 CSS pixels at deviceScaleFactor 1. The full comparison preserves the source frame for traceability; the app-owned and focused comparisons are the judgment inputs.

State matched across source and implementation: initial empty listing screen, Day 0 / 5, Month 0 / 50, Extra 17, no photos, Title English, Description English, Description style Long plus Bullet points, disabled Generate listing CTA, and helper copy visible.

## Full-view comparison

The information order and initial hierarchy now match: header and account affordance, New listing heading, usage quota, Item photos, language controls, description style, disabled CTA, and helper. Both implementation widths keep all persistent controls and helper text visible without overlap or viewport clipping. The supplied bottom dark/home chrome from the earlier captures is absent from these final captures and is not treated as app content.

## Focused-region comparison

- Photo card: the compact empty state, dashed drop zone, camera lens, and two action buttons are visible at both widths. `Choose from gallery` remains on one line.
- Controls and CTA: both language triggers, the description-style trigger, disabled CTA, and helper are visible at 390 and 412 pixels. The CTA is in normal flow and no longer covers the description-style row.
- Typography and icon focus: text hierarchy, globe icons, camera icon, gallery icon, chevrons, and the format affordance are legible. The format affordance is the only visible icon-style drift noted below.

## Findings

No actionable P0, P1, or P2 findings remain in the provided initial state.

- [P3] Description-style icon is a list glyph rather than the source's outlined document glyph.
  Location: `src/components/mobile-web/ListingControls.astro:176-188`, `.mobile-format-summary-icon` in `src/styles/mobile-web-app.css`.
  Evidence: the source shows an outlined document with internal lines; the implementation shows three visible list lines inside the pale icon tile. The icon is now legible and communicates the same control.
  Impact: small icon-family fidelity drift only. It does not affect recognition, tap target, copy, or hierarchy.
  Fix: if pixel-level parity is required, use the source-matching document/list icon from the established icon set and preserve the current contrast.

- [P3] Legal disclaimer copy is visible below the helper but is absent from the source visual.
  Location: `.mobile-workspace-footer` in `src/components/mobile-web/WorkspaceShell.astro:181`.
  Evidence: implementation shows `AutoLister is not affiliated with Vinted.` near the bottom at both widths; the source leaves that area empty below the helper.
  Impact: minor copy and whitespace difference outside the primary task hierarchy. Keep it if this disclosure is required for the product; otherwise place it below the source-matched initial viewport.

- [P3] Implementation display text is optically slightly heavier and more compact than the source in the heading and control labels.
  Location: `.mobile-app-heading h1`, `.mobile-upload-card-heading h2`, and the compact rules under `@media (max-width: 430px)` in `src/styles/mobile-web-app.css`.
  Evidence: the final captures preserve the source hierarchy and wrapping, but the implementation heading/labels use a darker, heavier optical treatment and tighter control spacing.
  Impact: small typographic polish gap only. No text is clipped, wrapped incorrectly, or made hard to scan.
  Fix: after confirming the source font/density target, tune weight and line-height tokens by a small amount without undoing the compact viewport fixes.

## Open questions

- Confirm whether the Vinted disclaimer must remain visible in the initial viewport for legal/product reasons. It is intentionally classified P3 pending that decision.
- No interactive menu, upload, loading, or result state was supplied in this comparison set. This report verifies the supplied initial empty state only.

## Comparison history

1. Previous pass at `506241f`: blocked on P1/P2 visual mismatches. The sticky Generate panel covered the description-style row at 390 pixels and pushed helper copy below the viewport; the gallery action wrapped; the photo card was too tall; the camera lens disappeared into the blue body; and the description-style icon appeared blank.
2. Fix in `9cbd4f1`: compact mobile rules reduced the photo empty state and card density, set the photo action to no-wrap, switched the mobile CTA to normal flow at widths up to 430 pixels, added a contrasting camera lens, and rendered a visible format icon.
3. Current final pass: the full, app-owned, and focused composites above show the fixed state at 390 x 844 and 412 x 915. No P0/P1/P2 mismatch remains. The residual icon, footer, and optical-weight differences are P3 only.

## Required fidelity surfaces

- Fonts and typography: hierarchy, wrapping, and readability pass at both widths; minor weight/density drift is P3.
- Spacing and layout rhythm: quota, upload, controls, CTA, and helper remain in the intended order with stable gaps and no overlap or clipping.
- Colors and visual tokens: background, navy ink, blue action, pale icon tiles, dashed border, and disabled CTA map closely to the source.
- Image quality and asset fidelity: camera, gallery, globe, and chevrons are sharp and legible; the format icon shape is a P3 family mismatch.
- Copy and content: primary source copy matches. The extra legal disclaimer is recorded as P3 pending product/legal intent.
- Responsiveness and accessibility: 390 and 412 pixel captures retain usable tap-sized controls, single-line gallery copy, visible helper text, and no horizontal overflow.

## Implementation checklist

- [x] Compare source and implementation together in full-view and focused composite inputs.
- [x] Normalize away source bezel/status/home chrome before judging app-owned content.
- [x] Verify 390 and 412 pixel initial states for hierarchy, wrapping, controls, CTA, and helper visibility.
- [ ] Optional P3 polish: align the format icon artwork, confirm disclaimer placement, and tune optical text weight if exact parity is required.

final result: passed
