# Prepared web beta and separate extension rollout

October 12, 2026. Preparation is authorized. Activation is conditional on the
release gates below. The approved shared retry migration is now applied and
verified in production. No customer generation, payment, customer contact or
store submission has occurred.

## Database acceptance

The existing production Supabase OpenAPI exposes `profiles`,
`generation_reservations`, `mobile_generation_idempotency` and all seven
reservation/retry/cleanup RPCs required by this flow. No cloud draft table or
permanent draft-photo bucket is a prerequisite.

The extension compatibility probe supplies a NULL user ID, which cannot match
the profile primary key. It creates no claim, reservation or customer debit.
Production now returns the expected missing-profile rejection for the extension
client. Catalog inspection confirms the binder matches the October migration,
the CHECK permits both clients, and the existing service-only grants and RLS
remain unchanged. The other retry function bodies still match September.

The native acceptance runner loaded the actual June reservation/commit/refund,
August paid entitlement/payment suspension, September retry and October shared
retry migrations into isolated PostgreSQL 12. Baseline column names/types came
from production metadata; baseline constraints/defaults are local fixture DDL.
There is no mocked reservation function in this runner.

It verified actual month/day/global budget changes, result replay, changed-input
conflicts, account/client isolation, plan/lifetime/pack debit and refund, ledger
entries, monthly/daily/burst/lifetime limits, delinquent payment rejection,
emergency/global budget rejection, service-only grants and expired cleanup.
Two simultaneous native claim connections produced one new operation; eight
simultaneous reservation connections produced one monthly debit. The unprotected
negative control produced two debits.

Evidence: [readiness metadata](qa/browser-drafts/release-readiness.json) and
[native acceptance](qa/browser-drafts/native-postgres-acceptance.json).
Catalog evidence is saved in `production-generation-catalog-before.json` and
`production-generation-catalog.json` beside those reports. The migration ran
transactionally with a two-second lock timeout, a fifteen-second statement
timeout and a guard against a changed live function body.

The existing Supabase CLI login provided management access. No new token,
credential, service or database connection was created. The browser session
required sign-in, but the CLI login worked. Cleanup runs through the existing
Vercel hourly endpoint; this project has no database cron table.

## Private web beta

Vercel access is working after normal refresh of the existing Windows CLI login.
The matched project is `quick-vint-api`, with production branch `main`.
Existing preview SSO protection is `all_except_custom_domains`. Keep the beta
on the protected preview hostname and preserve this protection. No new app
allowlist, database service, credential or publicly accessible beta is required.

The four app/draft feature flags are absent from the current project environment.
Prepare the following only for the selected preview deployment/branch:

```text
PUBLIC_MOBILE_WEB_APP_ENABLED=true
PUBLIC_LISTING_DRAFTS_ENABLED=true
MOBILE_WEB_APP_ENABLED=true
LISTING_DRAFTS_ENABLED=false
```

Reuse its existing Supabase URL/anon key and server provider credentials.
Never deploy fixture keys. Confirm the exact preview HTTPS origin in existing
app CORS and Supabase redirect configuration before inviting beta users.
Keep current limits and cleanup. Keep production app flags off while checking
real phone camera/library, HEIC, IndexedDB, keyboard, copy and scrolling.
This preparation does not claim those physical-device checks are complete.

Integrate current production `main` into the beta candidate before staging.
Use existing Git deployment and preview protection. Enable production only after
the complete journey and database prerequisites are verified.

The candidate now includes the five latest production commits, preserving their
telemetry, phone-upload and admin fixes. Its complete production gate passed
864 tests, lint, TypeScript, build and formatting after integration. One new
telemetry database test required the existing 15-second fixture budget used by
neighboring database tests. Instrumentation measured 6.98 seconds in cold embedded
PostgreSQL setup before endpoint assertions under full-suite load. All functional
assertions remain unchanged; no product timeout was modified.

## Separate extension package

The release state confirmed store upload `1.4.13`, with no pending upload.
Candidate `1.4.14` was bumped through the release script and packaged at
`quick-vint/dist/autolister-ai-v1.4.14.zip`. The pending version lock is `1.4.14`.
The uploaded-version marker remains `1.4.13`.

The source is saved on `codex/extension-retry-1.4.14`, commit `2370589`, separate
from production `main`. Package SHA-256:

```text
d87ea06fd4509ffaafa0ad2e8bd9fc3f4cd1facf728f53f382ca44c09c312e5d
```

The full source production gate passed 107 Node tests and 202 browser tests
(one existing disabled reproduction), then built the production bundle. The
actual minified script extracted from the ZIP passed another 18 generation-flow
browser checks, including the multipart JPEG original-source test and retry
identity tests. ZIP contents use the existing explicit release allowlist.

GitHub workflow `chrome-web-store-release.yml` and its
`CHROME_WEB_STORE_SERVICE_ACCOUNT_JSON` secret are available. Use that existing
workflow after the compatible backend SQL/API has been deployed and verified.
Do not run `release:mark-uploaded` or submit this held package early. Normal
workflow submission builds from the verified source on `main`; preserve the
version/pending-state rules and avoid duplicate packages.

## Activation and rollback

1. Verify deployed database definitions/grants and apply the tested additive
   `2026-10-11_shared_generation_retry_protection.sql` migration if needed.
2. Deploy the compatible backend through `npm run push:production` on `main`.
   Existing extensions without the new request header retain their old path.
3. Verify the private beta and real device journey, then enable it for the
   intended audience without changing current quotas or storage cleanup.
4. Submit the separately verified extension through the existing workflow.

Rollback the web beta by disabling its preview/build flags. Preserve local
drafts and the additive retry schema. Do not drop tables, reset usage, erase
customer data or change storage permissions. A submitted extension rollback
requires a compatible higher version through the normal store process.

## Temporary QA cleanup

All native test servers are shut down. Automatic approval review rejected
deletion of the three task-owned Windows test clusters with “blocked by policy”.
The stopped folders remain under `%TEMP%`:

```text
autolister-generation-postgres-b053caabadba4f589eb99b264c2617aa
autolister-generation-postgres-356c141073584250b4e922359a2ee6f9
autolister-generation-postgres-a7e083d51ace44d1a07889317bfc8030
```

Their source runner and SQL are preserved in `scripts/`, and the necessary
acceptance report is saved above. These folders contain only isolated synthetic
test data; they are not application infrastructure or customer storage.
