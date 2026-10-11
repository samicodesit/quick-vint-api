# Shared generation retry protection

October 11, 2026. Local changes only. No production migration or release performed.

The extension now opts into the existing mobile generation protection with
`X-Autolister-Client: extension` and a UUID `X-Autolister-Request-Id`. An uncertain
request reuses its exact prepared body and UUID. The server replays the saved
result rather than running AI and consuming another generation. A successful
operation clears the tab's pending request, so an intentional new generation
receives a new UUID.

This shares the existing Supabase table and RPCs, including atomic reservation
binding and verified usage commits. Historical mobile names remain for
compatibility. Extensions without a request ID retain their existing path.
Extension pricing, plan permissions, quota limits and the legacy free emoji
retry entitlement remain unchanged. No new service or permanent draft table
is required.

## Photo handling

Photo selection, captured original matching, compression, temporary upload and
the existing remote-image fallback are unchanged. Retries retain the exact
prepared images and signed URLs. If a storage image definitively fails and the
existing captured-file fallback rebuilds the payload, that replacement receives
a new UUID. It does not silently reuse an ID for different images.

The extension's manual-photo browser test decodes the actual multipart JPEG
sent to temporary storage. A 1600 by 1200 original produces a 1280 by 960 JPEG
even when a tiny Vinted thumbnail is present. Existing browser coverage also
checks phone originals, batch storage sources, reorder/delete matching and stale
URL fallback. This does not assert every marketplace image has an original
available.

## Scope and retention

Extension recovery is in memory in the same listing tab, for a 15-minute window.
It automatically retries a broken connection or unreadable success response once.
A later click with the same account, listing, photos and settings can retry the
same uncertain operation. Token refresh preserves account identity. Closing or
reloading the tab loses that state. This is not durable batch-resume recovery.
The mobile browser draft flow retains its existing durable operation metadata.

Request records store bounded result text, hashes and reservation references,
not photo bytes. The existing hourly cleanup retains its one-day buffer after
record expiry. A 15-minute operation window does not mean physical deletion
after 15 minutes. Temporary photo cleanup is unchanged.

## Verification

Run from the backend checkout:

```sh
npm run test:generation:browser
RUN_GENERATION_BROWSER_TESTS=1 npm run verify:production
```

The explicit browser gate requires the extension's Playwright installation and
Chromium. Set `AUTOLISTER_EXTENSION_PATH` if the checkout is elsewhere. It runs
the real extension script and API handler over real local HTTP sockets, with
actual migration SQL in embedded PostgreSQL (PGlite). It cuts a success response
after the database commit and checks provider execution counts and committed
reservation rows. A deliberate broken-ID control must produce duplicate work
and two committed reservations, demonstrating that the test detects the bug.
It also checks concurrent calls, changed inputs, account/client isolation,
authentication failures and a lost database acknowledgement after completion.

Auth, AI and external logging boundaries are synthetic. The SQL reservation
fixture is not the complete production quota schema; the existing quota and
entitlement regression suite remains required. No live provider, production
database, physical phone or authenticated marketplace test is implied.

Run the extension's complete `npm test` and `npm run build:prod` gates as well.

Verified locally on October 11, 2026:

- Backend production gate: lint, TypeScript, build, formatting and 859 tests
  passed, including the real browser/socket/SQL gate.
- Extension production gate: 107 Node tests and 202 browser tests passed, then
  the production bundle built successfully. One existing incident reproduction
  remains explicitly skipped; this work did not disable any test.
- A browser regression first reproduced losing the operation ID after an
  uncertain response followed by expired authentication. It now retains the
  same ID after signing back into the same account. Token refresh retains the
  payload; changing accounts or generation settings starts a separate operation.
- The broken-ID negative control produced two provider executions and two
  committed reservations. The corrected real socket-loss case produced one
  execution and one committed reservation before an intentional fresh click.

## Rollout prerequisite

Verify and apply the September 23 mobile retry migration, then
`2026-10-11_shared_generation_retry_protection.sql`, before releasing the opted-in
extension. Deploy the compatible API before the extension. Do not release the
new extension against an API/database that lacks these prerequisites. Confirm
deployment state separately; local tests cannot establish production state.
