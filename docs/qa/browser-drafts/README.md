# Browser draft QA evidence

October 9, 2026. Feature commit: `994ef65` on `codex/mobile-web-phase1`.

## Current UI review

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
