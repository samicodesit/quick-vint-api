# Authenticated mobile web app phase 1 design

## Context and goals

AutoLister needs a real authenticated mobile web product at `https://autolister.app/app`. Phase 1 is a single-item flow: a signed-in seller selects the item's photos, generates one editable title and description, copies either field, and opens the appropriate Vinted create-listing page. The product uses the existing accounts, five free lifetime generations, paid subscriptions, generation quota enforcement, Stripe products, AI prompt, output parser, and temporary upload storage.

The browser experience is an additive client of the existing product. It must not create an anonymous quota, a second account system, a second generation implementation, or a second pricing model. It must not alter the extension callback, `chrome.storage` session contract, extension version header, Orion behavior, or the semantics of existing extension requests.

Phase 1 goals are:

- deliver `/app` for authenticated phone and desktop browsers;
- support Google OAuth and one email containing both a magic link and a six-digit OTP;
- upload every selected photo for one item, preserving order and selection;
- reuse one `/api/generate` call for the title and description;
- expose independent title and description languages, Long or Short, and Bullets or Paragraphs;
- show server-authoritative plan, remaining quota, and reset timing;
- support local editing, copy actions, and a Vinted create-listing link;
- provide authenticated subscription checkout and return to `/app`;
- keep public acquisition pages indexable in all eight existing site locales while keeping the app private.

## Current reuse inventory

The following behavior is already implemented and is the source of truth for Phase 1:

| Existing contract | Reuse in the web app |
| --- | --- |
| `api/generate.ts` | Bearer authentication, request validation, independent language fields, Long or Short and Bullets or Paragraphs prompt branches, one structured model call, `parseOpenAIListingOutput`, footer handling, and success/error response shape. The call returns both `title` and `description`; the app must not split them into separate calls. |
| `utils/rateLimiter.ts` and `utils/tierConfig.ts` | Reservation, commit, refund, effective-tier resolution, burst and daily/monthly limits, five free lifetime generations, paid limits, and current pricing. Current paid prices are Starter EUR 3.99, Pro EUR 9.99, and Business EUR 19.99. |
| `api/phone-upload.ts` V2 | Authenticated temporary sessions in the `temp-uploads` bucket, one multipart file per request, ordered manifests, signed URLs, completion and cleanup. V2 accepts JPEG, PNG, WebP, AVIF, HEIC, and HEIF and limits each file to 4 MB. |
| `src/pages/phone-upload.html` | The existing 1280 px maximum-dimension JPEG quality 0.8 preparation, object URL revocation, browser image fallback, and EXIF orientation transforms where the browser exposes the required image data. |
| `api/auth/magic-link.ts` | Resend delivery of one email containing the Supabase action link and `properties.email_otp`. The web request adds an explicit web callback context; the extension default remains unchanged. |
| `public/auth-callback.js` and `src/pages/auth/callback.html` | Extension-only callback bridge. These remain unchanged and are never used by `/app`. |
| `src/scripts/attribution.js`, `src/scripts/analytics.js`, `api/events/track.ts`, and `api/attribution/claim.ts` | First-touch, referrer, UTM, and event transport. Add the `mobile_web` source and web-app click contexts without changing existing extension event values. |
| `api/stripe/create-checkout.ts`, `api/stripe/create-portal.ts`, `api/stripe/webhook.ts`, and billing helpers | Same Stripe prices and subscription ownership. Add bearer-authenticated web ownership and `/app` return URLs while preserving the current extension branch. |
| `src/layouts/SiteLayout.astro`, `src/i18n/site.ts`, `astro.config.mjs`, and the localized page templates | Existing eight site locales, canonical and hreflang conventions, x-default, public metadata, and sitemap behavior. Private app routes are explicitly excluded. |

`api/generate.ts` currently reserves quota after validation and refunds a reservation on provider, timeout, invalid-output, or other generation failures. The web app must preserve that server behavior. It must send no extension version header. A separate `X-Autolister-Client: mobile_web` context is used only where the server needs to distinguish web analytics, pricing-mode selection, checkout ownership, or idempotency.

Seller notes are currently profile or extension-oriented behavior, not a Phase 1 web sync contract. History, multi-item batch generation, offline generation, and a share target are not existing reusable contracts and are excluded below.

## Architecture and routes

The web UI is added in `quick-vint-api` as a same-origin Astro route and client-side app shell:

- `/app` is the authenticated application route. It has a private app layout, a `noindex, nofollow` directive, no public canonical, and no sitemap entry. It may render the signed-out auth card before session restoration, but all generation and account data require a valid Supabase session.
- `/app/auth/callback` is the web-only Supabase callback. It completes Google or email authentication, clears auth fragments or codes from the address bar, and returns to `/app`. It is `noindex, nofollow` and excluded from the sitemap.
- `/auth/callback` remains the extension callback page and continues to run `public/auth-callback.js`. No web logic is added to that route.
- `GET /api/user/usage` is a new bearer-authenticated, read-only usage and pricing summary endpoint.
- `POST /api/auth/magic-link` keeps its existing default behavior. A validated `client: "mobile_web"` request selects only the allowlisted `/app/auth/callback` redirect. Requests without that context continue to use the existing extension callback URL. The server must not accept an arbitrary redirect URL.
- Existing V2 operations in `/api/phone-upload` are used for mobile photos. The client opens `mode=single`, prepares the expected count, uploads one file per request, completes the session, and uses the returned signed URLs in `/api/generate`.
- Existing `/api/generate` remains the generation endpoint. The mobile client sends the bearer token and the `mobile_web` context, but no extension version.
- Existing Stripe endpoints gain a bearer-authenticated web branch. The existing extension branch, its origin checks, payload compatibility, and return URLs remain intact.

The app uses the existing same-origin API deployment. CORS is still allowlisted for any request that can be cross-origin in preview or production. The web client never reads Supabase tables directly for quota or subscription state.

## User flow

1. A visitor opens `/app`. The browser Supabase client restores a session. If no session exists, the page shows one Google action and one email form. The copy says that the email contains a sign-in link and a six-digit code. It does not present separate magic-link and OTP email flows.
2. Google redirects to `/app/auth/callback`. Email link clicks use the same callback. Manual OTP entry uses the email address and six-digit code from the same email.
3. After authentication, the app requests `/api/user/usage` and renders the current plan, remaining generation count or applicable paid limits, and reset timing.
4. The seller selects all photos for one item. The app keeps the selection order and does not impose an arbitrary UI photo-count cap.
5. The app prepares, uploads, and completes one authenticated temporary upload session. Progress and per-photo recovery are visible.
6. The seller chooses title language, description language, Long or Short, and Bullets or Paragraphs. Defaults come from the shared language and formatting logic, adapted for a browser with no Vinted hostname.
7. The app sends one generation request. The returned title and description are editable locally. Copy buttons write only the selected field to the clipboard and report success or failure accessibly.
8. The Vinted action opens the existing market-specific `/items/new` URL in a normal browser navigation. It does not promise to open the native Vinted app or to transfer fields into Vinted.
9. After a successful generation, the app refreshes usage. A limit response also refreshes usage and presents the server-provided next-step or pricing action.

## Auth and session

The browser Supabase client is configured with session persistence, automatic refresh, and URL-session detection appropriate for a first-party web app. It stores the session in browser storage, not `chrome.storage.local`. The app subscribes to auth state changes and keeps the API bearer token current.

Google uses Supabase OAuth with the exact redirect URL `/app/auth/callback`. The callback supports the response shape configured for the deployment, including the Supabase PKCE code exchange if PKCE is enabled and the hash session form if the provider configuration returns an implicit session. After the session is established, the URL fragment or code is removed with `history.replaceState`; tokens are never sent to analytics or logged.

The email flow is:

- the client posts the normalized email and `client: "mobile_web"` to `/api/auth/magic-link`;
- the server continues to use `supabase.auth.admin.generateLink`, extracts both `action_link` and `email_otp`, and sends the existing branded Resend email;
- clicking the link lands only at `/app/auth/callback` for a web request;
- manual entry calls the browser client with `verifyOtp({ email, token, type: "email" })`;
- the same existing abuse guard and Supabase cooldown apply. The UI displays the server's cooldown message and does not invent a local bypass.

Every API request uses `Authorization: Bearer <access token>`. On a 401, the client refreshes the session once and repeats the original read or upload request once. A second 401 signs out locally and returns to the auth card. The generation POST follows the idempotency rules below and is never blindly replayed after an unknown response.

## Usage API response contract

`GET /api/user/usage` requires a valid bearer token, returns `Cache-Control: private, no-store`, and uses the shared profile, tier, pricing, and `RateLimiter.getGenerationCapacity` logic on the server. It must not expose raw profile rows or permit client-supplied user IDs.

The stable response contract is:

```json
{
  "plan": {
    "tier": "free",
    "status": "active",
    "isPaid": false
  },
  "limits": {
    "freeLifetime": 5,
    "daily": null,
    "monthly": null,
    "burstPerMinute": 3,
    "packCredits": 0
  },
  "remaining": {
    "freeLifetime": 5,
    "daily": null,
    "monthly": null,
    "minute": 3,
    "packCredits": 0
  },
  "resetsAt": {
    "minute": null,
    "daily": null,
    "monthly": null,
    "subscriptionPeriodEnd": null
  },
  "canGenerate": true,
  "pricing": {
    "currency": "EUR",
    "tiers": {
      "starter": { "monthly": 3.99 },
      "pro": { "monthly": 9.99 },
      "business": { "monthly": 19.99 }
    },
    "creditPack": { "credits": 20, "price": 5.99 }
  }
}
```

Values that do not apply to a plan are `null`, not zero. Reset timestamps are ISO 8601 strings when the shared server logic can calculate them. A 401 means the session is invalid. The client treats 403 or 429 responses from generation and upload as server truth and never calculates a replacement quota locally.

## Photo pipeline and cleanup

The app must preserve every selected photo for the one item while respecting existing temporary-upload limits:

- Keep the original `File` objects in memory during the flow. Generate preview object URLs once, revoke every URL on replacement, completion, cancellation, unmount, and route change, and clear all file references after the flow ends.
- Use the existing preparation behavior: decode with `createImageBitmap` when supported, fall back to an `Image` element, apply EXIF orientation transforms when available, constrain the longest dimension to 1280 px, and encode JPEG at quality 0.8. A browser that cannot decode HEIC or HEIF must show a per-photo recovery message and allow replacement. HEIC support and orientation correctness are real-device launch gates, not assumptions based on desktop tests.
- Open an authenticated V2 `single` session, prepare the exact selected count, upload one compressed file per multipart request, and complete the session. Upload concurrency is bounded at three requests. The app never sends more than one file in a request and treats 4 MB as the current per-file limit.
- Use the ordered manifest and signed URLs returned by the upload infrastructure. Pass those URLs to `/api/generate`; do not send base64 photo data in the generation JSON.
- An `AbortController` cancels pending upload requests. Cancellation calls the existing cleanup operation best effort. Completion, failure, tab close, and route changes also attempt cleanup, while the server's idle one-hour and completed six-hour expiry plus `api/cron/daily-cleanup.ts` remain the final cleanup authority.
- Phase 1 does not persist source photos in IndexedDB, Cache Storage, or a service worker. If the browser restores `/app`, the app discards the interrupted photo selection and asks the seller to select again. It does not cache signed URLs or raw image bytes.
- No filenames, image URLs, raw images, or image content are sent to analytics. The client reports only bounded counts and status categories already supported by the event transport.

## Generation and error handling

The mobile payload uses the existing fields in `api/generate.ts`: `imageUrls`, `titleLanguageCode`, `descriptionLanguageCode`, `descriptionLength`, `useBulletPoints`, and the applicable style fields. The browser sends `generationMode: "manual"` unless the existing endpoint's accepted mode is explicitly extended for `mobile_web`. The server continues to derive the language names, prompt instructions, footer policy, and model request. Title and description are generated and parsed together in one structured request.

The app uses a single-flight generation state. While a request is pending, the generate action is disabled and duplicate clicks are ignored. Each intended generation gets a UUID request ID in `X-Autolister-Request-Id`, sent only with `X-Autolister-Client: mobile_web`. Before launch, the server adds a small idempotency record keyed by user, mobile client, and request ID. It stores the normalized request hash, status, reservation ID, response, and a short expiry, but never stores raw images. A repeat with the same key and request hash returns the stored success or current in-progress state without reserving or charging a second generation. Existing extension requests without this header retain current behavior.

Error behavior is explicit:

- 401: refresh the browser session once, then return to auth if it still fails.
- 403 or 429: show the server message and refresh `/api/user/usage`; do not retry automatically.
- 400: keep the selected files and controls so the seller can correct the request.
- 413: identify the affected photo, rerun the approved compression path, and allow replacement or retry without losing the rest of the selection.
- 415: identify the unsupported file and request a browser-compatible replacement.
- 5xx or 504: keep the output form and request ID, show that the request may still be processing, and retry only with the same idempotency key after the server-side record permits it. There is no automatic loop or fresh-key retry that could consume a second generation.
- upload cancellation or navigation: abort client requests and clean up the temporary session best effort.
- success: commit remains server-side, show both editable fields, refresh usage, and emit one success event.

The app sanitizes generated text before inserting it into the DOM. It does not save generated output to server history in Phase 1.

## Checkout and subscriptions

The mobile pricing and paywall use the same `TIER_CONFIGS` and Stripe price IDs as the existing product. The web branch of `api/stripe/create-checkout.ts` authenticates the bearer token, resolves the profile and email on the server, ignores client-supplied email or user IDs, and records `mobile_web` as the client/source context. It uses the existing Starter, Pro, and Business subscription products and keeps existing offer validation rules.

The web success and cancel URLs return to `/app`, carrying only the Stripe session identifier or a bounded status marker. The server never treats a query marker as proof of payment. After returning, the app polls or refreshes `/api/user/usage` with a short bounded backoff until the webhook-updated profile is visible, then displays the server plan. The Stripe webhook continues to own entitlement updates and usage-period resets.

The web branch of `api/stripe/create-portal.ts` likewise resolves ownership from the bearer session and returns to `/app`. Existing extension calls that supply their current payload and return URL remain unchanged. No new Stripe products or account records are created. Credit-pack presentation is shown only if the Phase 1 pricing surface explicitly exposes the existing pack; the pack itself remains the current product and is never reimplemented in the client.

## SEO, CTA, and Orion behavior

Public marketing and pricing pages remain server-rendered or statically generated and indexable in `en`, `fr`, `de`, `nl`, `pl`, `es`, `it`, and `pt`. Their existing canonical, hreflang, x-default, trailing-slash, and sitemap conventions remain coherent. The 18 output languages remain product controls and are not added as public SEO pages.

`/app` and `/app/auth/callback` emit `noindex, nofollow`, have no public canonical, and are excluded from `astro.config.mjs` sitemap output. If deployment headers are available, the same noindex policy is added as `X-Robots-Tag`. Private routes are not hidden only with `robots.txt`, because crawlers must be able to see the noindex directive.

CTA behavior is a shared responsive abstraction, driven by CSS breakpoints and route context, never by user-agent sniffing or Orion detection:

- mobile: one filled `/app` CTA, a quiet extension link, and the demo below the primary action;
- desktop: extension remains the filled primary, the demo remains available, and the web app is a small navigation or text link;
- no viewport shows two filled primary actions;
- locale paths and first-touch/referrer/UTM parameters are preserved when a CTA links to `/app`.

The Orion guide remains extension-first. Its instructions, runtime checks, and analytics stay unchanged. A subtle web alternative may appear after the guide instructions, but never replaces the Orion hero or primary extension action. The web app does not claim native Vinted handoff, universal app opening, or automatic field injection.

## Analytics and attribution

The app uses the existing event and attribution endpoints. New web events use `source: "mobile_web"`; CTA events use a `web_app_click` context and identify the page and CTA placement without user email or image data. First-touch capture uses the existing sanitized `autolister.first_touch.v1` contract. `ref`, UTM fields, and the first-touch record survive navigation to `/app` and into web checkout. Authenticated web arrival may claim the first-touch record through the existing bearer claim endpoint, best effort, without changing the extension callback claim behavior.

Analytics must distinguish page view, auth completion, upload completion, generation success or failure, copy action, Vinted-link click, checkout start, and checkout return. It must not send access tokens, refresh tokens, raw image data, generated full text, filenames, or arbitrary query parameters.

## Security and privacy

- Require Supabase bearer authentication for usage, upload-session opening, generation, checkout ownership, portal ownership, and attribution claim.
- Allow only `https://autolister.app`, configured preview origins, and existing approved Vinted origins where the endpoint contract requires them. Do not use wildcard credentialed CORS.
- Keep `temp-uploads` private. Use only server-issued signed URLs with their existing one-hour TTL and session ownership checks.
- Keep source photos in memory only for Phase 1. Revoke object URLs and call cleanup on every terminal path. Server expiry and cleanup remain the backstop.
- Do not expose profile, quota, or subscription table reads to the browser. The usage endpoint is the only client contract for plan and capacity.
- Respect the existing CSP and add only the Supabase and Stripe origins required by the web flow. Escape or sanitize output before DOM insertion.
- Preserve the existing auth email abuse guard, cooldown, disposable-email rules, and Supabase error wording. Do not reveal whether an unrelated account exists.

## Isolation and compatibility

The implementation is additive:

- new app pages, app-specific client modules, and a shared responsive CTA abstraction are the only UI additions;
- `/auth/callback`, `public/auth-callback.js`, extension `chrome.storage`, extension OAuth handoff, and extension version headers are untouched;
- `/api/generate` keeps the current request and response contract for extension clients. Mobile context, request ID, and modern pricing selection are opt-in and do not spoof an extension version;
- `/api/phone-upload` reuses V2 session storage. Any mobile-specific validation is scoped by `source: phone` or `client: mobile_web` and cannot loosen extension limits;
- quota reservation, commit, refund, and shared tier helpers remain centralized in `utils/rateLimiter.ts` and `utils/tierConfig.ts`;
- web billing, auth callback selection, analytics source, and SEO exclusions are additive branches or route entries. Existing extension checkout and Orion runtime behavior remain unchanged;
- any new idempotency table or helper is mobile-web scoped, has bounded retention, and is not read by existing extension requests.

## Testing, rollout, and rollback

Before implementation is considered ready, add and run:

- unit tests for callback selection, OTP and Google callback state handling, browser language fallback, formatting defaults, Vinted market mapping, idempotency state transitions, photo preparation, orientation fallback, and cleanup;
- endpoint contract tests for `/api/user/usage`, web magic-link context, generation client context, 401 refresh behavior, 403 and 429 payloads, upload 400/413/415 recovery, and authenticated web checkout ownership;
- regression tests proving existing extension generation, extension callback handoff, extension upload, pricing, Stripe webhook, attribution, and Orion paths are unchanged;
- browser tests at mobile and desktop breakpoints for sign-in, session refresh, photo ordering, generation controls, editable output, clipboard permissions, usage refresh, checkout return, CTA hierarchy, noindex, and sitemap exclusion;
- real-device checks on iPhone Safari and Android Chrome for Google OAuth, the email link and OTP, HEIC, EXIF orientation, large compressed photos, upload cancellation, copy actions, and the Vinted `/items/new` link. The native Vinted app opening behavior is not a requirement and must not be represented as verified.

Roll out behind an app route feature flag or an equivalent isolated release switch. Verify Supabase site and redirect allowlists, Google OAuth redirect configuration, Resend callback selection, Stripe test-mode return URLs and webhook delivery, CORS origins, CSP, temporary-bucket lifecycle, and production environment values in preview or staging first. Do not launch until the real-device gates pass.

Rollback is the route flag and CTA switch, followed by removal of mobile web traffic from analytics if needed. Existing extension APIs remain deployable throughout rollback. Any idempotency migration is additive and retained or disabled without deleting user data. No rollback step changes subscription records, quota counters, extension sessions, or the extension callback.

## Non-goals

- seller-note synchronization or cloud seller-note editing;
- generation history, saved drafts, or server-side output storage;
- multi-item batch generation or a batch UI. Bounded concurrency applies only to uploading the photos of one item;
- offline generation, source-photo persistence in IndexedDB or Cache Storage, a service worker, or a share target;
- native Vinted app deep-link guarantees, universal links, field injection, or automatic publishing;
- anonymous or guest quota, a second account system, or a new free-trial ledger;
- separate title and description model calls, a new AI endpoint, new pricing tiers, or new Stripe products;
- indexing `/app`, creating public pages for the 18 output languages, or replacing the public homepage with the app;
- changes to extension callbacks, extension storage, extension version compatibility, Orion runtime logic, or existing extension checkout behavior.

## Approved production-touching changes

The approved implementation may touch the following production surfaces, only additively: the new `/app` and `/app/auth/callback` pages; the web Supabase callback and magic-link context; `GET /api/user/usage`; mobile context and idempotency support in `/api/generate`; mobile use of V2 phone upload; bearer-owned web checkout and portal returns; mobile web analytics and attribution; responsive CTA components; sitemap and noindex route handling; Supabase, Google, Resend, Stripe, CORS, CSP, and feature-flag configuration; and the corresponding tests and additive database migration for generation idempotency.

## Acceptance criteria

Phase 1 is accepted only when all of the following are true:

1. `/app` authenticates with Google or one email containing both a working link and six-digit OTP, persists and refreshes the browser session, and never routes web users through `/auth/callback`.
2. `/api/user/usage` reports the server plan, applicable limits, remaining counts, reset timing, and pricing without client database reads or duplicate quota logic.
3. Every selected photo for one item is preserved through 1280 px JPEG preparation where supported, ordered upload, signed-URL generation, and cleanup. HEIC and orientation behavior is tested on both required mobile platforms.
4. One `/api/generate` call returns both editable fields with independent languages and the existing Long or Short and Bullets or Paragraphs behavior. Quota reservation, commit, refund, and mobile request idempotency prevent accidental duplicate charges.
5. 401, 403, 429, 400, 413, 415, 5xx, 504, cancellation, and checkout propagation states have the defined recovery behavior.
6. Copy actions work with an accessible fallback, and the Vinted action uses the existing market mapping and `/items/new` path without claiming native handoff.
7. Subscription checkout uses the authenticated account and existing Stripe products, returns to `/app`, and refreshes from webhook-backed server state. Extension checkout remains unchanged.
8. Mobile web analytics and first-touch attribution use the approved `mobile_web` source and `web_app_click` contexts without tokens, raw photos, or generated listing text.
9. Public eight-locale SEO, canonical and hreflang behavior, extension-first desktop CTA hierarchy, and Orion runtime behavior remain intact. `/app` and both callback surfaces are noindex as specified, with `/app` excluded from the sitemap.
10. Preview or staging and real iPhone Safari and Android Chrome checks pass before production exposure, and the feature flag provides a tested rollback path.
