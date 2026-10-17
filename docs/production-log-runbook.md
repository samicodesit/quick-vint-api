# Production Log Runbook

Use this before investigating user reports from production logs.

## Rules

- Do not guess from `view-logs` list rows alone. Fetch `log-detail` for any event or API call where request body/context matters.
- Keep secrets out of transcripts and commits. Put admin tokens in a local shell variable.
- Hard wall: production admin/API/Vercel log queries must be run with network escalation on the first attempt in Codex. Do not try `curl`, `vercel logs`, or production helper scripts sandboxed first.
- Use UTC timestamps from logs. Convert only for the user-facing summary if needed.
- In `/home/mests/projects/autolister`, the parent is not a git repo. `quick-vint` and `quick-vint-api` are symlinked repos; use `git -C <repo> ...`.
- For edits in symlinked repos, prefer `apply_patch`. Sandboxed shell writes, copies, and redirections into symlink targets can fail with read-only filesystem errors.

## Admin API

Load the local admin token from the parent workspace:

```sh
set -a
. /home/mests/projects/autolister/.env.local
set +a
```

Or set it manually:

```sh
ADMIN_TOKEN='paste-token-here'
```

List rows for an email:

```sh
curl -sS 'https://autolister.app/api/admin?action=view-logs&log_type=all&search=user%40example.com&limit=100' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o /tmp/user-all-logs.json
```

Print the rows:

```sh
node -e 'const d=require("/tmp/user-all-logs.json"); for (const l of d.logs||[]) console.log(`${l.created_at} ${l.endpoint} ${l.response_status} ${l.user_email||""} ${l.id}`)'
```

Fetch full detail for a row:

```sh
curl -sS "https://autolister.app/api/admin?action=log-detail&id=LOG_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o /tmp/log-detail-LOG_ID.json
```

Parse the body:

```sh
node -e 'const d=require("/tmp/log-detail-LOG_ID.json"); const l=d.log||d; const b=typeof l.full_request_body==="string"?JSON.parse(l.full_request_body):l.full_request_body; console.log(JSON.stringify({endpoint:l.endpoint, created_at:l.created_at, status:l.response_status, body:b}, null, 2))'
```

## What Each Log Level Proves

### Daily Vinted DOM canary

For real authenticated Vinted create-page selector/injection proof, search admin
logs for `dom-canary@autolister.app`, select the newest `/api/dom-canary` row,
and fetch its `log-detail`. Do not use the email, list row, or Windows
`LastTaskResult` as the verdict.

The detail's `full_request_body` must have `status: "passed"`, path `/items/new`,
`result.injected: true`, and true DOM flags for `title`, `description`,
`fileInput`, `tools`, `generateButton`, `signInButton`, `phoneButton`,
`titleLanguage`, and `descriptionLanguage`. Report its `occurredAt`,
`extensionVersion`, URL, and `result.dom.titleText`. An
`auth_required` failure is not selector-drift evidence.

This evidence comes from the installed Windows `AutoLister DOM Canary` task,
which runs around 16:30 Europe/Amsterdam against the authenticated real Vinted
page. Reuse the latest fresh result; do not trigger the browser task unless the
user explicitly requests a new run.

- `view-logs`: timeline, endpoint, status, user email, log id. Not enough for image source or extension version proof.
- `log-detail` for `/event/*`: event context. Use this for `extensionVersion`, page URL, `imageSources`, `imageSourceSummary`, and `imageSourceMode`.
- `log-detail` for `/api/generate`: generation request metadata and output. Use this for `imageUrlKinds`, `imageMetadata`, model, status, generated title, and payload source.
- Vercel request logs: endpoint hits and HTTP status. Use this for endpoints that are not fully represented in admin logs.

## Extension Version Checks

Event rows usually store version here:

- `full_request_body.extensionVersion`
- `full_request_body.context.extensionVersion`

`/api/generate` rows may not store the extension version even when the request header was sent. Do not treat a missing generate-row version as proof of an old build.

Existing helper:

```sh
node scripts/inspect-user-extension-version.mjs --email user@example.com
```

In Codex, run this helper with network escalation on the first attempt.

## Image Source / Upload Checks

Start with the existing helper when investigating a user's generation:

```sh
set -a
. /home/mests/projects/autolister/.env.local
set +a
cd /home/mests/projects/autolister/quick-vint-api
pnpm run ops:inspect-generation -- user@example.com --index 0
```

It saves list/detail output under `/tmp/autolister-admin-log-inspection/<email>/`.
Use raw `log-detail` calls below when you need event context, failed generations, or exact surrounding events.

For `/event/generate_click` and `/event/generate_request`, inspect:

- `context.imageSources[*].promptSource`
- `context.imageSources[*].capturedUploadAvailable`
- `context.imageSources[*].capturedUploadSource`
- `context.imageSourceSummary`
- `context.imageSourceMode`

For `/api/generate`, inspect:

- `full_request_body.imageUrlKinds`
- `full_request_body.imageMetadata[*].generationPayloadSource`
- `full_request_body.imageMetadata[*].promptSource`
- `full_request_body.imageMetadata[*].sourceKind`
- `full_request_body.imageMetadata[*].sourceUrl`
- `full_request_body.imageMetadata[*].capturedUploadAvailable`
- `image_urls` top-level column, which may be a JSON string summary rather than raw URLs.

Interpretation:

- `imageSourceMode: "vinted_dom_without_captured_upload"` means the page had Vinted-rendered photos and the frontend had no captured original file objects.
- `promptSource: "vinted_dom_image"` plus `capturedUploadAvailable: false` means no temp upload was available for generation.
- `generationPayloadSource: "manual_upload_storage_url"` means manual upload temp storage was used.
- `generationPayloadSource: "phone_upload_storage_url"` means phone/batch upload temp storage was used.
- `imageUrlKinds: ["data_url", ...]` means `/api/generate` received compressed image data, not temp signed URLs.

Existing Vinted edit pages normally have only Vinted-hosted DOM photos. The extension can only use temp uploads when it captured the original files during manual file input, phone upload injection, or batch injection.

### Why Vinted page photos were used

Start with the admin "Flagged" badge on a failed `/api/generate` row. It reads
`Photo preparation failed: ...` when a photo could not be downloaded before the
AI call (it names the photo number and host), or `OpenAI generation error: ...`
for provider failures. Both end with `| Photos: <count>x <source>`.

Each Vinted page photo carries the exact cause in
`imageMetadata[*].capturedUploadMatchStatus` (and the same value appears in
`generate_click` / `generate_error` as `context.photoSource`, e.g.
`vinted_page_photos:no_capture_expired`, or `captured` when every photo was the
seller's own file):

- `no_capture_expired`: originals were captured on this page but expired (30 minutes; storage links live 1 hour).
- `no_capture_existing_listing`: an `/items/<id>/edit` page. Vinted's 800px copies are the only photos that exist.
- `no_capture_drag_and_drop`: files were dropped on the page and never reached the file input.
- `no_capture_photos_present_at_load`: Vinted showed the photos when the form appeared (an opened draft or a restored form).
- `no_capture_never_captured`: photos appeared later without any captured upload.
- `count_mismatch_after_reorder_fallback_to_vinted`: photos were reordered, then the set changed.
- `count_mismatch_after_<reason>_fallback_to_vinted`: earlier captured files were dropped for `<reason>` (`expired`, `unmatched_set`, `delete_after_reorder`, ...).
- `count_mismatch_fallback_to_vinted`, `delete_after_reorder_fallback_to_vinted`, `delete_index_unmatched_fallback_to_vinted`: the captured set no longer matched Vinted's grid.

Generate requests above 3,500,000 UTF-8 bytes never go inline: their prepared
photos are uploaded to temp storage first and the request carries
`generationPayloadSource: "prepared_photo_storage_url"`. If that upload fails,
the user sees "Could not prepare photos. Try again." and `generate_error` has
`reason: "photo_storage_upload_failed:<upload HTTP status>"` and the photo
`order`. Page photos that travelled this way show in the Flagged badge as
`vinted_page_photo (<reason>) via prepared_photo_storage_url`.

## Phone Upload Logs

`/api/phone-upload` currently writes admin logs for failures, not successful uploads. A successful upload can exist in Vercel request logs without a matching admin `api_logs` row.

Use Vercel for endpoint-hit proof:

```sh
vercel logs --environment production \
  --since 2026-07-16T18:19:00Z \
  --until 2026-07-16T18:45:30Z \
  --limit 200 \
  --json \
  --no-branch \
  --query '/api/phone-upload' \
  > /tmp/phone-upload-vercel.jsonl
```

Summarize unique request rows:

```sh
node -e 'const fs=require("fs"); const lines=fs.readFileSync("/tmp/phone-upload-vercel.jsonl","utf8").split(/\n/).filter(l=>l.trim().startsWith("{")); const m=new Map(); for (const line of lines){const o=JSON.parse(line); if(!m.has(o.id)) m.set(o.id,o)} for (const o of [...m.values()].sort((a,b)=>a.timestamp-b.timestamp)) console.log(`${new Date(o.timestamp).toISOString()} ${o.requestMethod} ${o.requestPath} ${o.responseStatusCode} ${o.level} ${o.id}`)'
```

Vercel request logs usually do not prove which user made the request unless the app emitted identifying runtime logs. Use admin event/generate detail for user-attributed payload proof.

## Extension auth action correlation

The candidate `codex/auth-action-correlation` adds the fields below. Check actual
client delivery before expecting them; the already submitted 1.4.18 package does
not contain this candidate. Their absence in older records cannot establish that
no user action was blocked.

For the verified account and a tight UTC window, read `log-detail` for the refresh
and `/event/auth_action_result` rows. Match the refresh `operationId` against the
action's `authRefreshOperationId`. The action has its own `operationId`; a refresh
initiated by it also carries that ID as `parentOperationId`.

- `entryPoint=scheduled_refresh` identifies the initiating timer, not proof that
  no foreground action was affected. Check for `refresh_joined` and action results
  linked to the same refresh.
- `credentials_returned` proves only a credential response. `blocked` records
  an actual missing session or API 401 at Generate. `succeeded` records successful
  Generate completion despite the refresh failure.
- `recovered` links a matching successful retry to its earlier blocked action
  in the same content document and known account. Verify the generation attempt
  and successful output; do not substitute an auth success on another client.
- A changed photo/settings scope, account, expired retry window or destroyed
  content document does not establish recovery. Telemetry loss or absence is not
  proof of success. Network status 0 and `navigator.onLine` do not identify the
  underlying DNS/TLS/connection cause.

These action records are business evidence, without new incident emails or
watchdog flows. Original genuine auth failures remain incidents.

## Codex Network Rule

Codex sandboxed commands may fail with errors like:

- `curl: (6) Could not resolve host: autolister.app`
- `getaddrinfo EAI_AGAIN sentry.io`

Do not use those failures as a discovery step. For read-only production log/admin/Vercel queries, request network escalation before the first command.

Do not rely on a capped Vercel result set for absence. If checking a specific endpoint, use `--query '/api/endpoint'` and a tight `--since/--until` window.
