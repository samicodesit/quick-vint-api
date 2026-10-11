# Layout stability and control polish QA

October 9, 2026. Local preview: `http://localhost:4340/app/`. No deployment.

The user's screenshots exposed real defects after the previous QA: oversized photo controls, captions without padding on hover, a global settings entry below the header, lengthy settings summaries, and creation actions below the photo grid. The review also found that the first grouped item changed the desktop photo-column width. A changing page scrollbar caused horizontal recentering between short and long states. Earlier acceptance did not cover these conditions adequately.

## Governing design

The same installed [Taste Skill](C:/Users/Sami/.codex/skills/redesign-skill/SKILL.md), `redesign-existing-projects`, governs typography, spacing, controls, surfaces, hierarchy and states. The approved direction remains `autolister-design-concepts/direction-1-full-workflow.png`. The installed motion-design skill governs restrained state feedback and reduced motion. This pass repairs the existing Astro, TypeScript and CSS implementation.

- Global Listing settings now sits beside Account in the sticky header. On phones it uses a labelled settings icon. Item and batch overrides remain separate.
- Language controls use full native names and self-hosted, unmodified Twemoji 16.0.1 SVG flags. They do not depend on the operating system's flag emoji font. The [asset attribution](../../../public/app/flags/README.md) records source and graphics licensing.
- Photo selection uses a 20px checkbox. Photo options have a 32px visual surface inside a 44px target. Caption padding remains 16px on desktop and 12px on phones, including hover.
- Photo selection and library selection use fixed bottom action bars. The main grouping action reads Create item. It groups photos without generating text. The separate-item alternative appears for multiple selected photos.
- Grouping reserves the desktop item column before the first item is created. Batch progress replaces the generation action in a reserved area and updates the existing item rows, avoiding a duplicate progress list.
- The page reserves scrollbar width. Loading keeps existing cards visible with a busy indication. Collapsed settings show length and format without a wrapping list of every toggle.
- State entrances use 180 to 220ms feedback without changing layout dimensions. Fixed surfaces fade in. Reduced motion suppresses animation and smooth scrolling.

## Fresh verification

The complete deterministic draft journey passed with 45 recorded checks and no page errors. All regression cases passed: `presentation-polish`, `settings-layout`, `full-settings`, `ui-redesign`, `listed-retry`, `navigation`, `grouping-navigation`, `pages`, `scroll`, and `signout`.

The new presentation regression checks 360, 390, 768 and 1440 CSS pixels: header placement, stable Drafts/Listed toolbar and Add item coordinates, library selection geometry, normal/hover caption padding and card geometry, actual language selection by pointer and keyboard, decoded flag artwork, menu Escape/focus return, unchanged photo-grid geometry on selection, unchanged width after the first group, and the Create item action remaining visible before and after scrolling. Full-settings also asserts that starting batch generation leaves the item panel's bounding rectangle unchanged at all four widths.

The existing journey exercises single upload/generation, manual grouping, automatic generation after grouping, per-item settings, edit/copy and clipboard fallback, Listed/restore, navigation, reload recovery, save failure, conflicts, generation failure, quota stops, and bounded 20-item generation. Accessibility checks cover focus, modal containment, long content, reduced motion and simulated 200% layout zoom.

`npm run verify:production` passed lint, type checking, the feature-enabled 132-page build, formatting, and **116 test files / 828 tests**. The first gate stopped on formatting of four prior QA JSON files. They were formatted and the full gate rerun. One browser rerun encountered a temporary preview 404 while the build replaced `dist`; the full journey then passed against the finished build. During this pass, moving progress exposed an old CSS rule that hid the completed grouping section, including its newly nested progress panel. That rule was removed and full-settings passed before further acceptance.

Results: [presentation](presentation-polish/presentation-polish-result.json), [full journey](presentation-polish/result.json), [settings](presentation-polish/full-settings-result.json), [dialog geometry](presentation-polish/settings-layout-result.json), [accessibility](presentation-polish/redesign-result.json), [production gate](presentation-polish/production-gate.log).

## Inspected evidence

Fresh captures were opened and judged for proportions, alignment, padding, wrapping, crops, focus, menu containment and action hierarchy. Settings and account were also opened directly in the port 4340 preview. Representative captures are retained below. The responsive fixture matrix was captured locally; tests do not substitute for visual review.

Direct Windows Chrome measurements confirmed the same toolbar rectangle for populated Drafts, empty Listed and an open global settings dialog: x 288.33px, width 1120px, height 44px. This supplements the isolated browser regression with a check using native desktop scrollbars.

| Surface                            | Representative evidence                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library and padded hover           | [Desktop](presentation-polish/polished-library-1440.png), [phone](presentation-polish/polished-library-390.png), [hover](presentation-polish/polished-card-hover-1440.png)                                                                                                 |
| Fixed Create item action           | [360](presentation-polish/polished-grouping-360.png), [390](presentation-polish/polished-grouping-390.png), [768](presentation-polish/polished-grouping-768.png), [1440](presentation-polish/polished-grouping-1440.png)                                                   |
| Global settings                    | [360](presentation-polish/polished-language-settings-360.png), [390](presentation-polish/polished-language-settings-390.png), [768](presentation-polish/polished-language-settings-768.png), [1440](presentation-polish/polished-language-settings-1440.png)               |
| Language menu                      | [Phone](presentation-polish/polished-language-menu-390.png), [desktop](presentation-polish/polished-language-menu-1440.png)                                                                                                                                                |
| Batch before and during generation | [Before desktop](presentation-polish/studio-batch-ready-1440.png), [running desktop](presentation-polish/studio-batch-running-1440.png), [before phone](presentation-polish/studio-batch-ready-360.png), [running phone](presentation-polish/studio-batch-running-360.png) |
| Complete item controls and review  | [Item settings](presentation-polish/studio-full-settings-390.png), [review](presentation-polish/studio-review-390.png), [long content](presentation-polish/redesign-long-content-390.png)                                                                                  |
| Secondary surfaces                 | [Account](presentation-polish/redesign-account-390.png), [photo options](presentation-polish/redesign-photo-options-768.png), [sign-in](presentation-polish/auth-390.png)                                                                                                  |
| Entry and exceptions               | [Add item](presentation-polish/empty-390.png), [save failure](presentation-polish/save-error-390.png), [conflict](presentation-polish/conflict-390.png), [quota](presentation-polish/quota-390.png)                                                                        |

Earlier [settings repair](settings-repair.md) and the user's attached screenshots provide before evidence. They have different content, crops or viewport scales from some current captures, so they are not claimed as pixel-matched comparisons. Batch before/running and automated geometry checks use matching fixtures and widths.

## Limits

Physical iOS/Android devices, native browser zoom, mobile keyboard appearance, live authentication, real provider/billing integration and marketplace actions remain unverified. SVG artwork is loaded in local Chromium; this is not a claim that every device has been tested. Errors and changing content can naturally increase page height. The checked controls and columns retain their geometry across the recorded transitions. No blanket claim that all UI states are flawless is made.
