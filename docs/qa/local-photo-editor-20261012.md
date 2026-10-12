# Local photo editor QA

Approved scope: free crop, rotate, straighten, Reset and Save through each draft photo's existing menu. Cropper.js 2.3.0 is pinned and imported only on demand. No backend, generation limit, payment or extension behavior changes.

## Verified locally

- Actual Chromium journey passed 23 checks, including native mouse and CDP touch cropping, keyboard straighten, Square, Reset and three immediate open/close cycles with focus and body scrolling restored. Zero page errors. The four corners show 12px dots with 44px invisible drag targets.
- Layouts inspected at 320x568, 390x844, 768x844 and 1440x844. Save has a full touch target and remains visible. The desktop preview keeps useful height. Existing dropdown/account/paywall checks still pass at 360/390/768/1440px.
- Source-size JPEG export tested rather than a screen thumbnail. A complete 90-degree rotation swaps the exact source dimensions; sampled exported pixels match the clockwise transformation within JPEG tolerance. Editing photo two leaves photo one unchanged. Downloaded JPEG bytes match the edited blob. Generation upload contains those exact edited bytes.
- Cancel discards transformations. Restore recovers the exact first saved JPEG, removes the backup and closes the menu. Edits survive reload. The existing suite also checks local/offline drafts, grouping/batch, tailored quotas, bearer checkout failure/retry/cancel, response-loss recovery, copy/listed and deletion.
- Four added IndexedDB regression tests pass alongside the ten existing tests. They cover atomic edit/restore, first-original preservation, stale concurrent tabs, busy/moved/deleted/other-account rejection, input version updates, storage-cap rollback and refreshed object URLs across connections. Metadata transactions read only the selected blob for edits.
- Browser request tracing confirms editor/Cropper assets are absent before opening Edit photo. Transformations are visual only until Save; JPEG encoding runs once on Save. Closing removes the dialog and Cropper elements and disconnects its observer/listeners.

## Release acceptance

- Production gate passed lint, types, build, formatting and 955 tests in 129 files, including enabled real HTTP/browser/idempotency integration tests. Guarded push moved `origin/main` from `11fabb1` to `cc66fe5`. Vercel deployment `EYNpybch2pMmfigDhZch2e31HxaW` reached READY on October 12 at 23:08:56 GMT+2.
- The actual [deployed app](https://autolister.app/app/) passed the same 23 Chromium checks with its deployed HTML/CSS/JavaScript and fonts, while all auth/API/provider/billing calls were intercepted. No real customer account, purchase or marketplace listing was created. Live phone and desktop captures were inspected.
- Built editor JavaScript is 53,113 bytes, 15.97KB gzip, loaded through a dynamic import only when requested. The initial browser request trace contains no editor/Cropper assets. Production assets returned HTTP 200.

## Privacy brush follow-up

- The editor now has one Crop / Rotate / Hide area toolbar and one contextual options row. Crop shapes use a compact native select. The Straighten slider appears only with Rotate. Hide uses a familiar solid black brush with adjustable size and Undo. No new library, backend, data table or AI call is added.
- Actual Chromium passed 24 journey checks with zero page errors. The new privacy checks use real pointer and CDP touch strokes, brush-size keyboard changes, a single tap, multi-stroke Undo, Reset, Cancel and repeated immediate dismissal. Source regions start bright as a negative control. Exported selected pixels turn opaque black; unpainted regions retain their source colors within JPEG tolerance.
- Brush paths stay attached to source pixels through crop, rotation, angle adjustment and viewport changes at 320/390/768/1440px. The exported JPEG matches the actual previewed location. Downloads and the generation upload contain the flattened edited JPEG, and exact original restore still passes.
- Previews update at most once per animation frame. Only the current path changes during a gesture, and JPEG encoding happens on Save. Closing cancels the pending frame and releases pointer capture. Visual checks cover the compact phone/desktop layout and visible Save button. Physical phones and assistive-technology painting remain untested.
- Final production commit `b5b4e6b` passed the full 955-test/129-file production gate and guarded `main -> main` push. Vercel deployment `5pokzZirFzjCqo5ZFCcYQnRJjhyo` reached READY. The deployed `/app/` then passed all 24 actual Chromium journey checks with API/auth/provider/billing intercepted and zero page errors. Phone captures confirm the large slider focus outline is removed.
- Live first-load checking caught Astro hoisting the editor CSS. Styles now travel inside the lazy JavaScript and are installed once on first opening, using the app's existing style policy. The full editor is 18.56KB gzip, with no editor asset request before opening. The first-load assertion passes on the deployed site; no CSP permissions were changed.

## Limits

This is controlled browser QA with fixture auth and intercepted API/provider/billing responses, not a real purchase or live marketplace listing. Physical iOS/Android gestures, large camera files, native downloads and low-memory behavior remain untested. The preserved original is the app's existing prepared JPEG, not the full camera file. Original backup bytes count against the existing local storage cap. There is no cloud backup or new database table.
