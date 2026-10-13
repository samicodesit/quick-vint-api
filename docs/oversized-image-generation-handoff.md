# Oversized image generation: investigation and implementation handoff

Prepared 2026-10-13. Product fix not implemented or deployed.

## Problem and task

The problem domain is image preparation and transport across the extension,
our generation API and the upstream image host. The confirmed failure path is
that an oversized request replaces already-prepared image bytes with external
URLs that our backend subsequently cannot fetch.

Investigate and design the smallest reliable fix without unnecessarily reducing
image detail. Compare options before choosing compression, binary transport or
temporary storage. The user particularly wants useful photo detail preserved.

Important correction to the earlier conversation: our backend's image fetch
received HTTP 404 before the OpenAI model call. OpenAI did not perform that
failing fetch. The log prefix incorrectly groups this preparation error with
provider errors.

### Constraints

- Preserve every selected photo, order and useful visual detail.
- Do not silently drop photos or blindly shrink already modest images.
- Reproduce the confirmed mechanism before changing product behavior.
- Use real Chromium image decoding, canvas encoding and network transport.
- Do not trigger paid generation or live Vinted listing flows.
- Preserve cancellation, account isolation, generation idempotency, credits,
  performance and manual/phone/batch upload contracts.
- Reuse existing mechanisms where appropriate; avoid unnecessary services,
  permissions, migrations and telemetry.
- Preserve other threads' changes. Work inline unless separately authorized
  to delegate. New migrations/services/extension permissions need approval.
- Follow repository integration and release gates. Do not replace a pending
  Chrome Store submission.

## Workspace and source revision

```text
/home/mests/projects/autolister      Parent workspace, not a Git repository
/home/mests/projects/quick-vint      Extension repository
/home/mests/projects/quick-vint-api  Backend/site repository
```

Read workspace/repository AGENTS.md and these documents first:

- Backend: docs/production-log-runbook.md
- Frontend: docs/testing-strategy.md
- Frontend: docs/real-browser-testing.md
- Frontend: docs/real-batch-recovery-testing.md if evaluating that runner

Code references below were inspected in these local revisions. They are not a
claim that the local backend checkout equals the currently deployed revision.
Recheck the working tree and line numbers before editing.

```text
Frontend: 7430fc64216a499f91bbae7b55ab7edd8ebe27a7
Backend:  e17deb635d704d718e3c4af18d04906026a3917d
```

## Verified production incident

[Incident b85e8904-494b-422a-a10f-92f61033bf76](https://autolister.app/admin/reports?incident=b85e8904-494b-422a-a10f-92f61033bf76)

Client 1.4.14, Chrome desktop, Belgium, manual generation mode, 18 selected
photos. Incident acknowledged, not resolved. No personal account details are
included in this handoff.

| Generation attempt | Admin API record, UTC | HTTP |
| --- | --- | --- |
| gen_mv6lgoqr_ofm0ga | 2026-10-13 11:25:11.779 | 400 |
| gen_mv6lgtuo_mxknsz | 2026-10-13 11:25:17.923 | 400 |
| gen_mv6lh1ft_gc3vdi | 2026-10-13 11:25:27.979 | 400 |
| gen_mv6lhq66_rpcxwp | 2026-10-13 11:25:59.926 | 400 |

All four account-attributed admin log-detail records contained:

```text
flagged_reason:
OpenAI generation error: Invalid image URL: image fetch failed (404).
```

The narrow Vercel /api/generate query for 11:25:00 through 11:26:05 UTC returned
four matching error records at 11:25:11.187, 11:25:17.407, 11:25:27.555 and
11:25:59.442 UTC:

```text
Generation error: Invalid image URL: image fetch failed (404).
```

All four requests' image metadata recorded:

```json
{
  "generationPayloadSource": "vinted_remote_url",
  "generationPayloadFallbackReason": "request_body_too_large",
  "generationPayloadOriginalKind": "data_url"
}
```

Thus compression had produced embedded data and the oversized-body helper
replaced it with remote Vinted URLs. Eight diagnostic events represented four
failed generation attempts, not eight users or eight independent model calls.

### Measured compression output

For the inspected failed 18-photo request:

```text
Output dimensions:        600x800 or 800x600
JPEG quality:             0.8
Configured max dimension: 1280
Photos resized:           0 of 18
Sum of JPEG output bytes: 3,130,515
Approximate Base64 bytes: 4,174,020
Smallest JPEG:            154,569 bytes
Largest JPEG:             207,939 bytes
```

All were JPEG-encoded through the compression path. They were not resized
because their dimensions were below 1280. Base64 adds roughly one third to
binary size; JSON metadata and settings add more. The original complete
embedded request's exact UTF-8 byte count has not been reconstructed. Do not
present 4,174,020 as its exact final HTTP body size.

The application threshold is 3,800,000. Vercel documents a 4.5 MB function
request-body limit: https://vercel.com/docs/functions/limitations . Verify
current platform limits before implementation. Raising the threshold alone
does not handle larger sets.

### Subsequent successful requests

Same verified account:

- 11:26:29.770 UTC: API 200 with 16 data_url images, followed by matching
  client generate_success at 11:26:31.257, attempt gen_mv6li70z_qiu4jw.
- 11:30:39.687 UTC: API 200 with 13 data_url images, followed by matching
  client generate_success at 11:30:41.109, attempt gen_mv6lnl1u_p0zfgn.

These establish successful subsequent generation, not recovery of the failed
18-photo set. The sets/counts/payloads changed. They do not establish a saved
marketplace listing. Actual attributable credit ledger refunds have not been
checked; the refund code path alone is not proof of historical ledger outcome.

## Exact frontend references

Links pin the inspected frontend commit.

| File and line | Symbol / responsibility |
| --- | --- |
| [content.js:70](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L70) | MAX_GENERATE_REQUEST_BODY_BYTES = 3_800_000 |
| [content.js:2885](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L2885) | shouldRetryGenerateWithLocalCapturedImages |
| [content.js:2971](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L2971) | Existing manual-storage retry/preparation, continue through 3187 |
| [content.js:3345](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3345) | compressImageWithMetadata |
| [content.js:3504](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3504) | prepareImagesForGenerate |
| [content.js:3559](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3559) | getGenerateRequestBodyByteLimit |
| [content.js:3565](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3565) | getRemoteFallbackImageUrl |
| [content.js:3576](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3576) | maybeUseRemoteImagesForOversizedGeneratePayload |
| [content.js:3658](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3658) | getUploadedImageEntries |
| [content.js:3747](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L3747) | getCompressedImageBytes diagnostic calculation |
| [content.js:18816](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L18816) | buildPreparedGeneratePayload |
| [content.js:18861](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L18861) | generate_payload_remote_fallback telemetry |
| [content.js:18869](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L18869) | sendGenerateRequest and pending-request/idempotency handling |
| [content.js:19013](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/content.js#L19013) | Failed-response captured-file recovery branch |
| [background.js:2048](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/background.js#L2048) | PROXY_FETCH image download and blob-to-data-URL response |

### Source selection

Inspect captured-upload matching around content.js 3280-3343 and
getUploadedImageEntries. It distinguishes trusted original files, storage URLs,
DOM photos, count mismatches and order trust. Incident metadata showed Vinted
DOM image sources with no captured original available. Manual generation mode
does not prove the extension captured the original file input. Determine why
this set lacked trusted originals before blaming the normal manual upload path.

### Compression and transport

compressImageWithMetadata loads the image, optionally resizes to 1280 while
preserving aspect ratio, draws it into canvas and JPEG-encodes at quality 0.8.
Remote sources are first fetched through background PROXY_FETCH. It records
dimensions, quality, approximate bytes and resized status. Fixed per-image
quality is not a total-request size budget. JPEG re-encoding of already
compressed WebP/JPEG does not guarantee a smaller result or preserved detail.

prepareImagesForGenerate prefers recognized manual/phone storage generation
URLs. Otherwise it compresses at 1280/0.8. Compression failure returns the
original URL with compressionFailed metadata. Promise.all processes the set.
That compression-failure fallback is separate from this incident's successful
compression followed by oversized-body fallback.

maybeUseRemoteImagesForOversizedGeneratePayload compares JSON.stringify(body)
string.length to the threshold, then replaces all images with remote URLs.
string.length counts UTF-16 code units, not actual UTF-8 network bytes. Base64
is ASCII but Unicode settings/text can make total accounting inaccurate.

getRemoteFallbackImageUrl prefers vintedBestSrcsetUrl, then
vintedCurrentSrcUrl, vintedSourceUrl and finally sourceUrl for remote sources.
It may choose a different URL from the one that successfully supplied bytes
for compression. Compare exact fields; that difference is possible, not yet
proven for this incident.

If fallback URLs are missing, the helper can return the original oversized
request with a diagnostic reason. Inspect that behavior too.

### Existing recovery limitation

shouldRetryGenerateWithLocalCapturedImages requires HTTP 400 and metadata
containing phone_upload_storage_url or manual_upload_storage_url. This
incident used vinted_remote_url and therefore does not match that predicate.
The recovery branch rebuilds from captured files with ignoreGenerationUrls.
Do not just broaden the predicate: rebuilding the same oversized data can run
through the size helper again and choose the same failing remote URLs.

## Exact backend references

Links pin the inspected backend commit.

| File and line | Responsibility |
| --- | --- |
| [utils/openaiImageUrls.ts:1](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/utils/openaiImageUrls.ts#L1) | 8,000,000-byte remote image ceiling |
| [utils/openaiImageUrls.ts:32](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/utils/openaiImageUrls.ts#L32) | remoteImageUrlToDataUrl |
| [utils/openaiImageUrls.ts:45](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/utils/openaiImageUrls.ts#L45) | Exact image-fetch status error |
| [utils/openaiImageUrls.ts:65](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/utils/openaiImageUrls.ts#L65) | prepareOpenAIImageUrls |
| [api/generate.ts:1039](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/generate.ts#L1039) | Preparation before model call |
| [api/generate.ts:1414](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/generate.ts#L1414) | Sanitized catch/logging |
| [api/generate.ts:1442](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/generate.ts#L1442) | Generic user-facing image-processing error |
| [api/generate.ts:1449](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/generate.ts#L1449) | Detailed flaggedReason |
| [api/generate.ts:1455](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/generate.ts#L1455) | Conditional reservation refund |
| [api/phone-upload.ts:59](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/phone-upload.ts#L59) | Existing temp-uploads bucket |
| [api/phone-upload.ts:426](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/api/phone-upload.ts#L426) | Stored-file response and signed URL creation |

remoteImageUrlToDataUrl validates HTTPS/allowed host, fetches with Accept:
image/*, checks status/content type/size and converts response bytes to Base64.
prepareOpenAIImageUrls passes data URLs through and converts remote URLs using
Promise.all. One failed fetch rejects the set before the model request.

Remote fallback reduces extension-to-backend body size, but the backend still
Base64-encodes the remote images for OpenAI. It adds another fetch dependency
and can fetch a different rendition from the already-prepared JPEG.

The current allowed-host and upload ownership rules need review if changing
transport; do not broaden network access or signed-URL exposure casually.

Existing temporary storage is a candidate, not a preapproved implementation.
Inspect session ownership, signed URL expiration, cleanup, upload limits,
network failures, cancellation and recovery before reusing it for DOM-only
prepared images.

## Design questions and trade-offs

1. Why were trusted captured originals unavailable in this set?
2. Did fallback choose the same URL successfully downloaded for compression?
3. Was the backend 404 an invalid rendition, availability race or host behavior
   by request origin? Individual failed URL is not currently identified.
4. Can we preserve prepared bytes with less transport overhead? Binary or
   multipart could avoid Base64 between client and backend, but must be checked
   against actual platform parsing/body limits and larger sets.
5. Can existing temp storage safely carry exact prepared bytes for large sets?
   Benefit: preserves quality and small generation requests. Cost: extra
   uploads, latency, session/cleanup/recovery complexity and storage usage.
6. Would bounded adaptive JPEG encoding be acceptable after evaluating labels,
   fabric and small text? Benefit: smaller change/no new upload stage. Cost:
   additional CPU and irreversible detail loss. User rejects unnecessary loss.
7. Does 1280/0.8 suit modern phone/DSLR originals, orientation and formats?
   Large originals already lose pixels under that policy; suitability has not
   been validated with representative quality comparisons.
8. What concurrency and memory limits are needed for many large decoded images?
9. How can pre-model image errors be distinguished from provider failures using
   existing diagnostics without creating unnecessary telemetry noise?

Do not assume raising the cap, lowering quality, shrinking every image or
adding storage is automatically the best choice. Measure end-to-end bytes,
quality, latency and failure behavior. Never silently omit photos or repeat
the same failed URLs indefinitely.

## Existing tests and reproduction gaps

- [tests/e2e/extension.spec.js:4940](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/tests/e2e/extension.spec.js#L4940): manual storage URLs under low payload cap. Forces a 100-byte
  threshold, uses tiny fixtures and mocks upload/generation. Contract coverage,
  not realistic reproduction of the actual 18-photo size.
- [tests/e2e/extension.spec.js:5325](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/tests/e2e/extension.spec.js#L5325): original remote URL fallback when proxy compression fails.
  Different cause from this incident.
- [tests/e2e/extension.spec.js:6508](https://github.com/samicodesit/quick-vint-frontend/blob/7430fc64216a499f91bbae7b55ab7edd8ebe27a7/tests/e2e/extension.spec.js#L6508): stale phone storage URL retry using captured files.
  Does not cover oversized DOM-image fallback.
- [src/utils/__tests__/openaiImageUrls.test.ts:4](https://github.com/samicodesit/quick-vint-api/blob/e17deb635d704d718e3c4af18d04906026a3917d/src/utils/__tests__/openaiImageUrls.test.ts#L4): helper tests for data and remote image preparation.
  Not full browser-to-backend reproduction.

### Required meaningful reproduction

Use actual Chromium image decoding/canvas encoding and an actual local HTTP
server with a representative 18-photo set and the real 3.8 MB threshold.
Serve the initial image download successfully, then return controlled 404 for
the subsequent fallback fetch. Isolate the model boundary to avoid paid AI.
Inspect actual serialized body, URL selection, count/order and retained photos.

This can reproduce the confirmed mechanism without pretending to reproduce
Vinted's historical reason for 404. Clearly label real versus controlled parts.

Additional cases: ordinary small sets, modern phone/DSLR dimensions,
already-compressed JPEG/WebP, labels/fine texture/small text, manual/phone/batch
and DOM-only sources, reorder/deletion, connection interruption/reconnection,
cancellation, account changes, idempotent retries and UTF-8 byte measurement.

Run timing/network/lifecycle reproduction three times, then full required gates:

```bash
# Frontend
npm test
npm run build:prod

# Backend, if changed
npm run verify:production
```

Endpoint changes require endpoint-level coverage, not helper tests alone.
Inspect combined diff and use established production push/Store pipelines.
Check actual Chrome Store status before preparing an extension submission.

## Investigation process correction already applied

Scheduled triage and the production runbook now require exact attempt/account/
UTC correlation, flagged_reason and payload metadata, size/source-fallback
tracing, backend error-path inspection and matching Vercel logs where needed.
Report the precise remaining missing fact only after reading existing evidence.
Do not treat success with different photos as recovery of the failed set.

The earlier vague answer was incomplete investigation, not missing tracking.
The original detailed error was present in both admin and Vercel logs. The
product fix still requires reproduction, design selection and verification.
