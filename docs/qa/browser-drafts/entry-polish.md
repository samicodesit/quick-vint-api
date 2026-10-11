# Entry, settings and selection QA

October 11, 2026. Branch: `codex/mobile-web-phase1`. Local preview: `http://localhost:4340/app/`. No deployment or customer/marketplace actions.

This record supersedes earlier acceptance for entry spacing, settings scope transitions, account counters, manual writing and selection. The installed [Taste Skill](C:/Users/Sami/.codex/skills/redesign-skill/SKILL.md), `redesign-existing-projects`, governs typography, hierarchy, spacing, surfaces, controls and states. The installed motion-design skill guides dialog feedback and reduced motion. The approved editorial direction remains in place, using the existing Astro, TypeScript, CSS and Lucide stack.

## Requested changes

| Request                                    | Implementation and check                                                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animated listing settings and account      | 220ms entrance and 160ms exit. Dialog containment stays active until exit finishes. Reduced motion disables animations. Escape and focus return are exercised.                                                                                           |
| Format, hashtags, emojis and note icons    | Format choices have List/AlignLeft icons; switches have Hash, Smile and StickyNote. Supporting note copy is 11px.                                                                                                                                        |
| Consistent language and tone controls      | Shared accessible dropdown with pointer, keyboard, typeahead and Escape behavior. Self-hosted SVG flags accompany language names. Standard uses Gauge, distinct from paragraph format.                                                                   |
| Header/footer separation and desktop close | Explicit shadows, context inside the header, fixed footer action and internally scrolling form. Close control hit-tested at all four widths.                                                                                                             |
| Representative account usage               | Local mock shows 12/50 today, 83/500 this month and 17 extra credits. Counts do not wrap; the credits badge stays beside its label. Zero credit balance stays hidden.                                                                                    |
| Combined photo entry                       | Desktop splits QR handoff and local upload inside one bounded panel. Phone uses the native image chooser without a forced capture source. Visible limit captions and the separate camera button are removed. Existing backend limits remain enforced.    |
| One Add new CTA                            | Blue Add new opens One item/Multiple items choices with icons. Both enter the same photo-entry composition. Mode tabs share coordinates and disappear once preparation begins.                                                                           |
| Compact entry and manual alternative       | Tighter back/title/tabs/panel spacing, centered underlined manual link and no redundant helper or item-settings box.                                                                                                                                     |
| Global settings and item/batch context     | Header entry chooses current item, batch or defaults. Scope changes retain the modal frame and backdrop with no repeated entrance animation. An interrupted close cannot release the newly opened scope.                                                 |
| Batch settings without navigation          | Row settings open over grouping, save through existing versioned autosave and restore focus to the row. Grouping and item editor visibility stay unchanged.                                                                                              |
| Lean batch removal                         | One X target to the left of each ungenerated item. Removing returns its photos to the pool and removes the resulting empty draft. Generated/busy items do not offer this action.                                                                         |
| Grouping completion                        | No confusing Review drafts action. Add photos remains available; generation stays with eligible items. Generated completion avoids an empty action area.                                                                                                 |
| Stable manual writing                      | Photo-free writing stays centered at the same width and coordinates before typing, after autosave and after reload. No empty photo column.                                                                                                               |
| Less workspace clutter                     | Prepared-JPEG guidance lives inside Save photo options. Back controls have an inset hover surface while their icon aligns with the heading.                                                                                                              |
| Selection and deletion                     | Whole-card clicks toggle selection. Cancel exits and clears selection. No duplicate Clear button. Delete selected uses one confirmation, deletes only selected items and retains undeleted items after failure. A photo-free selection hides generation. |

No endpoint, database, entitlement or persistence contract changes were made for this polish. Existing photo correction, clipboard fallback, version handling, autosave and manual Listed semantics are retained.

## Verification

The final deterministic Chromium run covers 360, 390, 768 and 1440 CSS pixels. The complete journey records 45 checks with no page errors. Eleven additional cases pass: `entry-polish`, `settings-layout`, `full-settings`, `presentation-polish`, `ui-redesign`, `listed-retry`, `navigation`, `grouping-navigation`, `pages`, `scroll` and `signout`.

New checks exercise QR session opening, failure, expiry, retry, copy and simulated completion for single and batch entry; global defaults reaching generation; modal opening/closing and scope geometry; manual writing geometry; batch-row settings without navigation; removing/regrouping photos; whole-card selection; canceled and confirmed bulk deletion. Existing checks exercise single and grouped automatic generation, edit/copy, Listed/restore, recovery, conflicts, save/provider failures, quota, pause/resume and bounded batches. Keyboard navigation, focus containment/return, long content, reduced motion, touch targets, contrast, horizontal overflow and simulated 200% CSS zoom are checked.

Two older browser assumptions were updated for the requested behavior: selection mode must be canceled before clicking a card to review, and viewport animations must settle before geometry is compared. Assertions for stable coordinates remain intact. A direct Windows Chrome check additionally exercised whole-card selection in the port 4340 preview.

`npm run verify:production` passes lint, type checking, the feature-enabled build, formatting and 116 files / 828 tests. [Production gate](entry-polish/production-gate.log), [full journey](entry-polish/result.json), [entry and selection](entry-polish/entry-polish-result.json), [settings](entry-polish/full-settings-result.json), [dialog geometry](entry-polish/settings-layout-result.json), [layout](entry-polish/presentation-polish-result.json), [accessibility](entry-polish/redesign-result.json).

## Visually inspected evidence

Fresh rendered screenshots were inspected for alignment, wrapping, padding, proportions, photo crops, shadows, focus and action hierarchy. Accurate clothing fixtures are used. Representative evidence is retained, while disposable rerun captures are removed.

- [Desktop photo entry](entry-polish/new-entry-1440.png).
- [Desktop settings](entry-polish/item-header-settings-1440.png) and [phone settings](entry-polish/item-header-settings-390.png).
- [Centered manual writing](entry-polish/manual-writing-1440.png).
- [Phone batch ready](entry-polish/studio-batch-ready-360.png) and [tablet batch ready](entry-polish/studio-batch-ready-768.png).
- [Phone completed batch](entry-polish/batch-generated-390.png).
- [Phone selection and deletion](entry-polish/library-selected-390.png).
- [Phone usage and extra credits](entry-polish/account-extra-credits-390.png).

## Coverage limits

QR handoff and native chooser behavior are fixture-tested. Physical phone scanning, real camera capture, iOS Safari, Android Chrome, on-screen keyboard behavior, native browser zoom, live authentication, provider/billing integration and real marketplace flows remain unverified. CSS zoom is not a substitute for native browser zoom. New bulk deletion is checked for cancellation and exact successful deletion; a partial bulk-delete failure and a batch-item settings conflict were not separately injected in this pass. Existing single-item conflict and retry paths are covered. No claim of universal device compatibility or flawless coverage is made.
