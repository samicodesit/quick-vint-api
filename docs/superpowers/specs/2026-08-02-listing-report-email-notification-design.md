# Listing Report Email Notification

## Scope

Send one email to `samicodesit@gmail.com` for every accepted
`listing_report_submitted` event. No other tracking event sends this email.

## Design

The existing `/api/events/track` handler remains the single ingestion path. After
it persists the accepted events, it sends a Resend notification for each
`listing_report_submitted` item. The email includes the report context plus the
authenticated user email, plan, page, and extension version when available.

Email delivery is best-effort: a Resend failure is logged but does not reject or
discard the already-recorded report. The existing `RESEND_API_KEY` configuration
and `alerts@autolister.app` sender are reused; no frontend change, database change,
queue, retry system, or new dependency is added.

## Verification

An endpoint-level test will prove that a submitted listing report sends exactly
one email to the requested recipient and that unrelated tracking events send no
email. The repository production verification gate must pass before pushing
`main`.
