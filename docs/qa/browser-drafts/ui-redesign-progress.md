# AutoLister UI redesign acceptance

October 9, 2026. Local implementation in `.worktrees/mobile-web-phase1`, branch `codex/mobile-web-phase1`. Preview: <http://localhost:4340/app/>.

The approved calm, photo-led seller workspace is implemented. [Taste Skill: redesign-existing-projects](https://github.com/Leonxlnx/taste-skill) governed typography, composition, surfaces, interaction and state review. The installed instructions are `C:/Users/Sami/.codex/skills/redesign-skill/SKILL.md`. Astro, TypeScript, existing CSS and Lucide remain in place. No API, database, entitlement, generation or persistence contract changed.

## Delivered

- Self-hosted Geist, preserved wordmark, neutral canvas, restrained blue, shared spacing/radius tokens and visible focus.
- Compact Drafts/Listed navigation, four/three/two library columns and grouped creation/selection actions.
- A bounded add-item composition with one empty gallery picker, instruction, mobile camera and nearby manual entry.
- Left-aligned grouping navigation and an explicit completion state. Ineligible generation actions are hidden with explanatory text.
- A bounded photo column, focused review/copy workspace, adjacent copy controls, visible save acknowledgement and contextual back labels.
- Consistent account/settings/photo surfaces. Mobile dialogs dim and isolate the background, contain keyboard focus, support Escape and restore focus. Responsive desktop photo menus stay inside the viewport.
- Readable upload error cards. Generation dismisses settings before showing progress or quota messages. Photo corrections release the sheet before replacing its controls.

## Verification

`npm run verify:production` passes lint, TypeScript, the feature-enabled 132-page Astro build, formatting and 115 test files / 817 tests. Build flags enable the local app and drafts and use the isolated `drafts-test.supabase.co` fixture configuration.

The deterministic draft browser suite and the `ui-redesign` case pass with no page errors. Six existing review regressions also pass: `listed-retry`, `navigation`, `grouping-navigation`, `pages`, `scroll`, `signout`. These verify retry, delayed detail, later-page review, scroll restoration and failed sign-out alongside the main workflow. Fixtures intercept API, Storage, auth and provider traffic. Product photographs are the repository's sample clothing images.

The browser suite exercises single and bulk preparation, selection, grouping, review/edit/copy and clipboard fallback, Listed/restore, browser Back/Forward, reload recovery, save failure, version conflicts, photo corrections, paused generation, accepted-operation recovery, generation failure, bounded batches and quota handling. Mobile sheet cleanup after ungrouping was reproduced failing before the fix and passing afterwards.

## Visual coverage

All rows below were captured at **360, 390, 768 and 1440 CSS pixels**, then visually reviewed. Fresh captures are in `ui-redesign/` beside the JSON results. Full-page captures include content below the viewport; fixed sheets appear at the bottom of the viewport portion, not the full-page image.

| Surface               | Captured state prefixes                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Library               | `library-loading`, `library-error`, `home-empty`, `library`, `listed`, `batch`, `partial-failure`                                |
| Entry and preparation | `empty`, `bulk-empty`, `photo-preparation`, `upload-progress`, `upload-error`, `photo-decode-error`, `generation-progress`       |
| Grouping              | `grouping`, `grouped`, `redesign-grouping-complete`                                                                              |
| Review and recovery   | `editor`, `redesign-review`, `redesign-long-content`, `save-error`, `recovery`, `conflict`, `quota`                              |
| Secondary surfaces    | `settings`, `account`, `account-error`, `delete-confirmation`, `redesign-settings`, `redesign-photo-options`, `redesign-account` |
| Authentication        | `auth`, `otp`, `otp-error`                                                                                                       |

Keyboard opening, Tab/Shift-Tab containment, Escape, focus return, focus visibility and photo selection were exercised. Primary, copy and library selection targets are at least 44px. Text palette contrast on white meets 4.5:1. Reduced-motion feedback, long editable text, menu bounds, horizontal overflow and 200% CSS zoom were checked. Fresh add-item captures were also compared with the earlier audit at matching desktop and phone browser sizes. The live demo preview was reloaded and inspected; its existing unrelated photos remain demo content.

## Limits

This establishes local Chromium fixture behavior and visual quality. Physical iOS/Android devices, actual camera/HEIC handling, mobile keyboards, Safari, screen-reader announcements, real browser zoom, real Google/OTP delivery, billing checkout, staging integrations and live provider/Storage behavior remain unverified. Browser-native batch confirmation prompts retain their existing behavior. No marketplace flow, publication, deployment, charge or customer account was used.

Image delivery uses both actual image bytes and a final local Markdown image for desktop. Post-turn rendering on desktop and mobile is not yet confirmed by the user.
