# Phone Auto-Upload Design

## Goal

Make phone photo selection feel like one continuous action: selected photos immediately appear in the current desktop workflow, users may append more selections, and no phone-side Send or Done concept is exposed.

## Phone Experience

The primary phone action has four clear states:

- Empty: purple `Choose photos`.
- Transferring: disabled purple animated `Adding X of Y…`.
- Ready for another selection: purple `Add more photos` with a quiet green `Y photos ready on your computer` status.
- Failed: red `Retry N failed photos`; successful files are not repeated.

Selecting photos starts the existing compressed, bounded-concurrency, retrying upload queue immediately. When one selection finishes, the picker becomes available again and another selection appends in gallery order. Rows show progress and a passive green check after success. They do not show a remove action because a completed row may already exist on the desktop; mistakes are removed through the existing Vinted gallery or batch `Discard photo` control.

The phone never mentions separate upload, finalization, or sending stages. Copy stays limited to the current action, count, and actionable failure.

## Desktop: Single Listing

The existing phone modal continues to show the QR, received count, previews, language controls, `Done`, and `Done + Generate`. Every fully uploaded phone wave is fetched and appended to the current Vinted photo gallery without waiting for a phone confirmation. A later wave appends only its new files.

The existing `Done` action closes and locks the session. `Done + Generate` locks the session and then runs the existing generation flow. These existing desktop actions define the end of appending; no new confirmation is added.

## Desktop: Batch Upload

The existing batch modal shows receiving progress. After the first fully uploaded wave becomes available, it opens the existing `Organize items` screen. Later phone waves append their new photos to `Photos to group` without disturbing existing groups or selections. The user removes mistakes with the existing `Discard photo` action.

Starting batch generation locks the session before generation begins. Generation remains unavailable while a selected wave has missing or failed photos.

## Session Protocol

The existing per-tab uploader lock remains authoritative. The owning uploader may only increase the session's expected count; it cannot decrease it. A different uploader remains rejected. Desktop consumers request only newly uploaded files so each file is signed and downloaded once instead of re-signing the whole growing session on every poll.

Locking is explicit and irreversible. After the desktop locks the session, the API rejects every later prepare or upload request. The phone replaces its entire interactive page with a terminal success screen:

- Heading: `Photos added on your computer`
- Helper: `You can close this page.`
- No picker, file rows, retry, cancel, or session controls

The page cannot reopen or reuse the QR. A late gallery selection that loses the lock race is not reported as uploaded; the terminal screen replaces it immediately.

Legacy v1 behavior remains unchanged. No database counters, realtime subscriptions, per-photo metadata writes, or new dependencies are added.

## Branches and Failures

- Cancelling the native gallery picker changes nothing.
- A second selection appends and raises the expected count before its uploads start.
- Automatic retries run for transient failures. Exhausted failures expose only the red retry action and keep desktop completion/generation unavailable.
- Closing the phone mid-transfer leaves the desktop in its existing paused state. Returning to the same tab can retry; otherwise the user cancels and starts a new upload.
- Closing an incomplete desktop modal keeps the existing confirmation and cleanup behavior.
- Expired, cancelled, or differently owned sessions retain their existing explicit error states and never masquerade as success.

## Verification

- Phone-page regression coverage proves selection starts without a Send click, a second wave appends, CTA states and colors are correct, successful rows use passive checks, and a desktop lock removes all interactivity.
- API coverage proves same-owner count increases, decrease rejection, different-owner rejection, incremental file delivery, and irreversible lock behavior.
- Extension coverage proves incremental injection for single listings, incremental ungrouped additions for batch, existing desktop actions lock the session, and late phone requests cannot change the locked set.
- Existing API, extension, and production build gates remain green.
