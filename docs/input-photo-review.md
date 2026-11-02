# Original photo review

Owner direction, November 2: preserve existing uploaded photos privately for
24 hours so seller corrections can be checked against the actual model input.
This is a backend change for web and extension. It needs no extension package.

## Contract

- Reuse the private `temp-uploads` bucket. Completed and expired upload sessions
  move their existing photo objects into a reserved `_review-<session>` prefix.
  There is no second browser upload, model call, or photo byte upload by this
  implementation. Explicit cancellation still deletes the active session.
- The deadline is 24 hours after each original upload, encoded in the archived
  filename before moving. Retries cannot renew it. The existing hourly cleanup
  removes expired objects on its next successful pass, normally within one hour.
  Admin review URLs expire at the deadline even if deletion is delayed.
- Public upload actions reject reserved prefixes and path traversal, including
  session IDs supplied inside multipart bodies. Storage remains private with
  no anonymous/authenticated object policies. Admin `log-detail` is the only
  application path that signs archived review photos, for at most five minutes.
- The existing successful generation log records the original storage path,
  photo position and SHA-256 of the exact decoded bytes sent to the provider.
  Hashing and the existing reporting write run after the committed response on
  both supported clients. Upload cleanup moves run in Vercel background work.
  Normal upload and generation do not add network calls.
- Six-hour log compaction still removes prompts, generated copy, email, IP,
  browser details and original URL lists. Only bounded review pointers, byte
  hashes and request/model attribution survive until 24 hours. Existing web
  metrics retain their existing 30-day policy.

## Review and limits

The reviewer downloads a signed photo transiently and compares its bytes with
the recorded SHA-256 before using it as original-input evidence. A path alone
does not prove which bytes the model received. A mismatch, missing object,
expired window or storage failure is unverified, never a model error.

Only existing UUID upload-session photos can be retained. Inline images,
external URLs, old deleted photos and legacy extension requests without a
verified committed request remain outside coverage. Inputs uploaded long
before generation have a shorter remaining review window. Original instructions
must still be reviewed within their existing six-hour window; photo evidence
alone cannot establish a prompt-policy violation.

Hourly review retains only labels, pseudonyms and aggregate conclusions locally.
Do not save photos, signed links, raw instructions or seller copy in monitoring
files. Review new corrections immediately rather than waiting for daily reports.

## Release and verification

Apply `migrations/2026-11-02_input_photo_review.sql` after testing and before
deploying the corresponding backend. It replaces the existing compaction
function, adds no tables and retains service-role-only execution. The production
function body must match the October 27 migration before replacement.

Run endpoint tests for generation, upload, admin detail and hourly cleanup;
run PostgreSQL compaction tests and the full production push gate. Verify the
deployed commit and inspect natural generations independently for each client.
Confirm photo-byte matches through authenticated admin detail after upload
cleanup, and later confirm expiry. Do not manufacture production generations.

Rollback: stop new retention by reverting the application change, but keep
the reserved-prefix denial and expired-review cleanup until the archive is
empty. Revert the compaction function only after the remaining review window
has elapsed. Never expose the review namespace during rollback.
