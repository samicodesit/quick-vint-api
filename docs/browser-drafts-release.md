# Browser drafts release handoff

Updated October 12, 2026 on `codex/mobile-web-phase1`. Not deployed.

## MVP architecture

Prepared JPEGs, text, grouping, settings, Listed status and active attempt metadata
are saved in account-scoped IndexedDB in the user's browser. Reloading the same
browser preserves saved work. Clearing site data or browser eviction removes it.
There is no cross-device draft sync. The library states “Saved in this browser”.

The UI retains single-item preparation, batch grouping, sequential generation,
direct editing, copying, photo controls and deletion. Mark as listed is available
after text exists and remains a manual status change, never marketplace publishing.
Local edits need no API call.

Generation reuses existing authenticated temporary phone uploads and the generation
API. Stored JPEGs are uploaded only when generation starts, without another decode
or recompression. Existing temporary storage cleanup remains in force. Successful
results are committed locally before requesting temporary upload cleanup.

The existing limits remain: ten photos per item, 100 photos per import, twenty
items per run, 500 saved items, 512 MiB of local photo capacity, and 4 MiB per
prepared JPEG. The browser may provide less space. Storage failures remain explicit
and never display a false Saved acknowledgement. Backend quotas, plan permissions,
account checks, reservations and abuse controls remain authoritative.

## Recovery and account safety

The browser commits an operation ID before dispatch. Repeated clicks share one
active promise; transactions prevent two tabs from claiming different generations
for the same item. Save and grouping versions prevent overwriting another tab.

A lost response uses the authenticated, read-only `/api/generation-result`
endpoint. It reads the existing mobile retry record and reservation state.
It never calls AI, claims a request, or reserves another generation. A result
received before a local write failure is retained in memory for a save retry.
Expired or unavailable outcomes require an explicit new generation, with usage
guidance. Remaining batch items stop when the page closes; no background queue
is promised.

Storage clients are bound to one account, not a mutable global identity.
Generation and recovery refuse a different account, including after token refresh.
Object URLs are cached within a workspace and revoked on removal or disposal.
Sign-out preserves that account's local saved drafts.

## Infrastructure and rollout

No cloud draft table or permanent draft-photo bucket is required. The browser
does not call `/api/drafts` or `/api/draft-photo`. The older cloud implementation
is retained behind its server flag for compatibility; do not enable it for this
MVP and do not apply `2026-10-09_listing_drafts.sql` as an MVP prerequisite.
Do not drop existing database objects or erase saved production data.

Mobile generation retry protection is a separate dependency. Its migration,
`2026-09-23_mobile_web_generation_idempotency.sql`, is present in this feature
branch but absent from the checked-out `origin/main`. Confirm its deployment
state and stage it if needed. Production OpenAPI checks now confirm the retry
table and required RPC signatures are exposed. This establishes their presence,
not their complete deployed SQL definitions or grants. It uses the existing Supabase database and existing
generation reservation schema, without a new database service. Local fixture
checks do not establish that this migration is deployed.

See [the prepared beta and extension rollout](beta-and-extension-rollout.md) for
the current native database acceptance, protected-preview access and held
extension package. Production generation remains on its existing source line.

The opted-in extension shares this protection with the additive
`2026-10-11_shared_generation_retry_protection.sql` migration. See
[shared generation retry protection](shared-generation-retry-protection.md) for
compatibility, verification and backend-before-extension rollout requirements.
This adds no cloud draft storage requirement.

Before activation:

1. Review and integrate against current production main, then run the complete
   required checks on the integrated tree.
2. Stage the mobile retry migration if absent. Check ownership, grant restrictions,
   committed-result lookup, expired-record cleanup and reservation races.
3. Reuse existing provider credentials, Supabase, temporary upload storage and cron
   cleanup. Verify upload/read/remove and generation recovery in staging.
4. Stage `MOBILE_WEB_APP_ENABLED=true`, `PUBLIC_MOBILE_WEB_APP_ENABLED=true`
   and `PUBLIC_LISTING_DRAFTS_ENABLED=true`. Keep server
   `LISTING_DRAFTS_ENABLED` off. The latter public flag selects the local-draft
   workspace and does not enable a cloud draft backend.
5. Verify existing auth callback/origin configuration, account/usage/billing flows
   and real iOS Safari/Android Chrome camera, JPEG preparation, HEIC handling,
   IndexedDB, keyboard, clipboard and scroll behavior.
6. Deploy only after explicit release authorization, using the established
   production push flow. No deployment, production migration, customer contact,
   account change, charge or live marketplace action occurred in this task.

## Deterministic local verification

Build with the intercepted fixture configuration:

```bash
PUBLIC_MOBILE_WEB_APP_ENABLED=true \
PUBLIC_LISTING_DRAFTS_ENABLED=true \
PUBLIC_SUPABASE_URL=https://drafts-test.supabase.co \
PUBLIC_SUPABASE_ANON_KEY=test-anon npm run build
npm run preview -- --host 127.0.0.1 --port 4331
```

In another shell, set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to the installed
tooling if needed, then run:

```bash
DRAFT_BROWSER_URL=http://127.0.0.1:4331 \
DRAFT_BROWSER_OUTPUT=/tmp/autolister-local-drafts \
node scripts/test-local-browser-drafts.mjs
```

The dummy public key and URL are only for intercepted local testing. Never deploy
them. The older `test-browser-drafts.mjs` cloud-fixture journey is historical;
the new local journey exercises real browser IndexedDB with mocked generation
and temporary uploads. See [local storage QA](qa/browser-drafts/local-storage.md)
for acceptance evidence and limits. Physical devices and live external integration
remain release gates.

## Rollback

Rebuild with `PUBLIC_LISTING_DRAFTS_ENABLED=false` to restore the earlier browser
composer, or disable the whole app using its existing app flags. Preserve local
browser data and deployed retry records. Do not delete accounts, reset allowances,
drop tables, or change storage permissions as a rollback shortcut.
