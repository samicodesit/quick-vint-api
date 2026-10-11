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

The approved backend is now live on production `main`, commit `7d90880`.
Its required production push gate passed 864 tests, including the browser/HTTP
integration tests, lint, types, build and formatting. GitHub CI also passed:
https://github.com/samicodesit/quick-vint-api/actions/runs/38181600328

The first CI attempt found Astro build-tool advisories through the new icon
component dependency. `@lucide/astro` is used only by static `.astro` templates,
so it belongs with the existing Astro build dependencies. Moving it there kept
all package versions unchanged and restored the existing production dependency
boundary. The production audit now passes with zero high/critical findings;
one low and four moderate findings remain. This does not claim that all build
tool advisories are patched.

Vercel access is working after normal refresh of the existing Windows CLI login.
The matched project is `quick-vint-api`, with production branch `main`.
Existing preview SSO protection is `all_except_custom_domains`. Keep the beta
on the protected preview hostname and preserve this protection. No new app
allowlist, database service, credential or publicly accessible beta is required.

The following app/draft flags are now configured only for preview branch
`codex/mobile-web-phase1`. No production flag is enabled:

```text
PUBLIC_MOBILE_WEB_APP_ENABLED=true
PUBLIC_LISTING_DRAFTS_ENABLED=true
MOBILE_WEB_APP_ENABLED=true
LISTING_DRAFTS_ENABLED=false
```

The private preview is ready at:
https://quick-vint-api-git-codex-m-09f8c8-ahmed-samis-projects-e6ef0336.vercel.app/app

It reuses the existing Supabase URL/anon key and provider credentials. The exact
branch origin was added to its branch-only CORS setting, preserving all existing
origins. Supabase permits only its two exact callback URL forms; the existing
site URL and redirects remain intact. No fixture key was deployed.

The project normally cancels preview builds to save resources. The explicit Git
preview deployment overrides that build skip for this deployment only; the
project setting remains unchanged. Preview protection remains enabled. The
existing automation authentication was used for QA, without creating another
token or changing access rules.

Live preview HTTP checks verified unauthenticated access redirects to Vercel
login, authenticated app load returns 200, same-origin API preflight passes,
the usage API requires user authentication, and the cloud drafts endpoint stays
disabled. Production app and mobile usage checks still return disabled behavior.

Installed desktop Chrome loaded the actual deployed sign-in page at 360, 390,
768 and 1440 pixels. All four passed: no horizontal overflow, controls above the
fold, loaded fonts and no page exceptions. Evidence:
`qa/browser-drafts/private-beta-landing.json` and
`qa/browser-drafts/private-beta-sign-in-390.png`.
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
`quick-vint/dist/autolister-ai-v1.4.14.zip`. The uploaded-version marker is now
`1.4.14`, following successful upload. Its local pending lock was cleared only
after that success.

The source is saved on `codex/extension-retry-1.4.14`, commit `2370589`, and has
now been deliberately fast-forwarded and pushed to frontend `main` through its
full production gate. The local preparation ZIP had SHA-256:

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
Store status independently confirmed published version `1.4.13` before release.
The approved existing workflow succeeded with `upload-and-submit` and
`bump_patch=false`, preserving the already-tested `1.4.14` version. It repeated
the full unit and browser suites in CI before upload:
https://github.com/samicodesit/quick-vint-frontend/actions/runs/38181793913

Google returned upload `SUCCEEDED` and publish `PENDING_REVIEW` at
2026-10-11 22:54 UTC. The public version was still `1.4.13` at submission.
This is submission for review, not proof that Google has published the update.
The workflow committed release state as `7430fc6`, and local `main` was updated.

CI passed 107 unit tests and 187 browser tests. Its 16 existing CI skips include
15 coordinated checks that need the separate backend checkout, plus the disabled
incident reproduction. The local full gate had that backend checkout and passed
202 browser tests with only the disabled reproduction skipped.

The exact uploaded CI package was downloaded from that run and its actual
minified code passed 18 generation-flow browser tests plus two auth/truncated
reply cases, including the processed
original JPEG assertion. Its SHA-256 is:

```text
105569c96071bbe80953181ba2c51c238c3fe5d2bd21e1f3e7cd1540a3037661
```

The initial invocation incorrectly supplied the content file instead of the
package directory to the test runner. It failed with `ENOTDIR` before loading
product code. Correcting the runner argument produced the passing result above;
no product change or weaker assertion was needed. The canonical local ZIP now
contains the exact uploaded artifact; its duplicate download and extracted copy
were removed after verification. Manifest version, permissions and host
permissions match the release source.

## Activation and rollback

1. Complete: deployed database definitions/grants verified and the tested
   additive shared retry migration applied.
2. Complete: compatible backend deployed through `npm run push:production` on
   `main`. Existing extensions without the new header retain their old path.
3. Remaining: verify the private beta's real device journey, then enable it for the
   intended audience without changing current quotas or storage cleanup.
4. Complete: verified extension submitted through the existing workflow. Google
   review is pending.

The backend push used the clean checkout at
`/home/mests/projects/autolister/.worktrees/backend-production-release-20261012`
on `main`, preserving unrelated local edits in the primary backend checkout.

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
