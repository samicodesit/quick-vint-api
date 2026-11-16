# Billing cron attention correction

The November 15 and 16 alerts all concern one withdrawal already marked
processing after an identification request was delivered. The cron treated every
unresolved request older than 24 hours as an unhandled request, returned HTTP 500
and captured own_context_exception. Release-scoped fingerprints generated a new
email after each deployment. There were no failed or queued billing notices.

Count only received requests in the untouched-request guard. Processing remains
an explicit unresolved operator task, counted in the successful cron response
and available in the existing withdrawal records. Do not mark it resolved, send
another email or change the original receipt. There is no processing deadline
in this schema, so receipt age must not pretend to measure operator inactivity.
Future structured reminders would require a separately designed policy.

Regression: the actual cron handler previously returned 500 for the saved
processing state. It now returns 200 across three simulated server releases.
Untouched overdue requests, delivery failures, manual-review holds and database
failures still fail and report. This changes no customer email content or UI.

Verification: run the endpoint regression, full production gate, inspect the
combined diff, push through the established main pipeline and inspect a natural
scheduled cron request on the deployed commit. No billing notices are fabricated
or sent as tests. Keep the underlying identification task open.
