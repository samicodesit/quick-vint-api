# Settings and toolbar repair QA

October 9, 2026. Local preview: `http://localhost:4340/app/`.

The preceding visual acceptance was incorrect. The user's empty-composer screenshot exposed a settings panel below its trigger with only about 95 pixels for fields and a bottom edge outside the viewport. Drafts/Listed switching moved creation actions about 700 pixels at the inspected desktop width because hiding Select removed the auto margin. Global defaults were available only through an item's settings. Earlier review captures did not cover these exact transitions or assert their geometry.

## Design and behavior

The governing skill remains `C:/Users/Sami/.codex/skills/redesign-skill/SKILL.md` (`redesign-existing-projects`). The approved reference remains `autolister-design-concepts/direction-1-full-workflow.png`, with the existing typography, palette and photo hierarchy. The settings presentation is deliberately corrected from anchored/third-column panels to a centered desktop dialog and a mobile bottom sheet. This follows the user's current request for usable, globally accessible controls.

- Listing settings is visible across the library, Listed, new item, grouping and review. Defaults save for this account on this device and apply to new items. Existing item overrides and active batches retain their settings.
- Item settings keeps independent overrides. Both surfaces provide separate languages, length, format, tone, hashtags, emojis, note text and note inclusion.
- Settings remain inside the viewport with an internally scrollable body, persistent heading, close control and bottom action. Background controls are inert; Tab wraps, Escape closes, and focus returns to the opener.
- Drafts/Listed tabs and creation actions retain identical positions across transitions. Opening settings does not reflow the review's photo/text columns.

## Fresh evidence

The new `settings-layout` browser regression first failed on toolbar geometry at 768 pixels, then passed after the repair. It checks 360, 390, 768 and 1440 CSS pixels, including 700-pixel-high viewports, global-default save/reload, existing overrides, note validation, desktop focus wrapping and Escape restoration. A 720 x 500 viewport checks the effective layout size of a 1440 x 1000 browser at 200% zoom; this is a viewport simulation, not a physical browser zoom test.

Fresh renders were inspected for alignment, spacing, wrapping, control hierarchy and scroll containment. Representative captures: [global desktop](settings-repair/global-settings-1440.png), [global phone](settings-repair/global-settings-390.png), [short desktop](settings-repair/empty-settings-short-1440.png), [short phone](settings-repair/empty-settings-short-390.png), [Drafts](settings-repair/toolbar-drafts-1440.png), [Listed](settings-repair/toolbar-listed-1440.png). The paired toolbar captures use matching viewport sizes and fixtures. The user's before screenshot has different crop/scale and is not a pixel-matched comparison.

Verified directly in the port 4340 preview: global Listing settings opens from Listed as a named modal with all supported fields, stays inside the normal desktop viewport, and leaves the underlying creation actions aligned.

Browser checks passed: full deterministic draft journey, full-settings, UI accessibility, settings-layout, Listed retry, navigation, grouping navigation, later-page review, scroll restoration and failed sign-out. The journey covers upload, manual grouping, automatic batch generation, editing/copying, Listed/restore, reload recovery, save failure, conflict, generation failure and quota using fixtures. The accessibility case includes reduced motion and long content.

`npm run verify:production` passed lint, type checking, feature-enabled build, formatting and 116 test files / 828 tests. [Focused assertions](settings-repair/settings-layout-result.json), [journey assertions](settings-repair/result.json), [settings assertions](settings-repair/full-settings-result.json), [accessibility assertions](settings-repair/redesign-result.json).

## Limits

These are local fixture checks and inspected responsive renders. Physical phones, native browser zoom, mobile keyboard appearance, live authentication/provider/billing and marketplace actions remain unverified. No publishing or production deployment occurred. This correction does not establish that every possible UI state is flawless; it establishes coverage of the reported defects and the recorded regressions.
