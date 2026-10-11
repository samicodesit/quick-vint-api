# Rendering and overlay performance

October 11, 2026. Local feature branch `codex/mobile-web-phase1`.

## Opening, dismissal and startup correction

The earlier settled screenshots missed a first-frame bug. Native details opened immediately, then their queued toggle handler started a fade from zero. At four-times CPU throttling, Add new painted at opacity 1 before resetting to 0. Small Add new and settings dropdowns now open and close immediately. Settings, item/photo menus, batch-item settings and restored menus establish their modal behavior and motion in the opening event, before the first paint.

Dialog motion now uses 160ms entry and 100ms dismissal. The panel and its backdrop share the same animation clock and fade together; rapid reversals start from the current frame. Photo Close buttons use the same dismissal path. Immediate closes cancel unfinished motion, and disposal invalidates pending close callbacks. Reduced motion closes immediately. The previous 220/160ms values mentioned in the historical measurements below are superseded.

An account-sheet CSS workaround hid the logo and header controls. Its backdrop now sits within the sticky header's stacking context, below the panel and above the visible header. The logo and controls retain their layout and remain covered and inert while the sheet is open. [Inspected mobile account capture](performance-overlays/account-header-390.png).

Startup exposed the library before restoring saved batch/review screens. Restoration now reveals the requested view after it is ready, without the initial page-entry fade. The first library render starts in its loading state instead of briefly claiming the account is empty. The app preloads its three existing self-hosted Latin fonts to start those downloads earlier; it does not wait indefinitely for fonts.

Frame checks at 360, 390, 768 and 1440 pixels cover normal/reduced motion, keyboard opening, synchronous settings containment, dropdowns, account/header layering, dismissal and cleanup. The backdrop and panel opacity match throughout every sampled dismissal. Actual first-closed frames in the final throttled run range roughly from 104 to 124ms; 100ms is the animation duration, not a wall-clock guarantee under CPU load. Delayed API fixtures at 390/1440 check single-item entry, batch entry, preparation and review reloads. Guest first-paint frames contain only the sign-in heading. Auth callback and phone-upload source already initialize one state; their native/provider transitions are not claimed as fully browser-tested here.

Eleven targeted browser cases and the complete draft journey pass. The final startup/first-frame cases were rechecked after font preloads and cleanup changes. The feature-enabled build, lint, TypeScript, formatting and 116 files / 828 unit tests pass. One build attempt hit a GitHub raw connection timeout, leaving its sitemap incomplete and causing the SEO unit check to fail; the complete rebuild and full unit rerun passed.

[Compact before/after measurements](performance-overlays/opening-and-loading.json).

Settings synchronize only their own controls. Unchanged labels, disabled states, selected options and artwork retain their DOM nodes. Option lookup uses one map per sync instead of repeatedly searching the native option list. Dropdowns track their single open widget, so idle document clicks and resize events do no dropdown work. Closing a containing details panel also closes its dropdown; disposal removes the listeners.

The hidden library defers rebuilding until it is shown. Its underlying data still updates immediately. The photo-grid signature includes actual move destinations instead of unrelated item metadata, and destination filtering runs once per grid render. Text editing and autosave therefore retain the photos and their menus.

Account-menu exit completion uses a token. Rapid close/reopen cancels the old exit without releasing the active sheet. Immediate close during workspace cleanup also cancels pending motion. Existing keyboard controls, focus containment, reduced-motion support and responsive positioning remain.

Settings are modal at every width, so they no longer subscribe to the mobile breakpoint or rebuild their modal when it changes. Resizing retains the active field, backdrop and scroll lock. Phone-only sheets still subscribe and adapt when needed.

## Measurements

Deterministic local Chromium at 390 and 1440 CSS pixels, without CPU throttling:

| Probe                                                                     | Before | After |
| ------------------------------------------------------------------------- | ------ | ----- |
| Dropdown DOM mutations from 20 idle clicks                                | 360    | 0     |
| Dropdown DOM mutations from one note edit                                 | 144    | 0     |
| Selected artwork replacements from that edit                              | 9      | 0     |
| Hidden library child mutations during item opening and autosave, 36 items | 74     | 0     |

The final probe uses a 36-item library and ten photos on the edited item. Text autosave produces zero photo-grid child mutations. The synchronous dropdown-opening handlers measured approximately 3 to 7ms locally, including layout positioning. These are observations on this machine, not a device-wide latency guarantee. The existing 220ms entry and 160ms exit animations remain intentional.

[Original select probe](performance-overlays/before-selects.json), [library probe after the select fix](performance-overlays/before-library.json), [final combined probe](performance-overlays/after.json).

## Verification

The new browser case exercises keyboard navigation, changed language artwork, repeated Tab/Escape closes, settings and account cycles, immediate account close/reopen, item/default scope switching, resize focus retention, focus restoration, and cleanup of backdrops, inert backgrounds and scroll locks. It also checks that returning to the deferred library shows the latest saved title.

Fifteen browser regression cases and the complete journey pass, including all 28 short-screen viewport checks. Lint, TypeScript, formatting, the feature-enabled 132-page build and 116 test files / 828 unit tests pass. The final responsive-overlay correction is rechecked in the performance and settings cases.

[Complete journey result](performance-overlays/journey.json).

The complete journey now waits for the visible grouped item instead of requiring the hidden library to rebuild during grouping, then verifies all three library cards after returning. That return check exposed a missing refresh in Close grouping, which was fixed before acceptance.

## Limits

Fixtures simulate authentication, uploads and generation. Real provider latency, physical phones, hardware safe areas and native camera UI are not benchmarked here. No deployment, production data changes or additional runtime dependencies.
