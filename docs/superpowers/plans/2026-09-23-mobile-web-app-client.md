# Authenticated Mobile Web App Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated `/app` single-item browser flow with the approved mobile prototype interaction model while consuming the backend foundation without adding a second auth, quota, generation, or storage system.

**Architecture:** The app is a static Astro shell with a vanilla TypeScript client state machine, because `quick-vint-api` has no React integration and already serves browser scripts. Supabase browser auth owns the persisted session, a small API client owns bearer refresh and error normalization, and shared Astro presentation components expose the same photo rail and editable result markup to the later public sample. Source photos remain in memory, V2 upload is ordered and bounded, and one idempotent generation request drives the result state.

**Tech Stack:** Astro 5 static pages, TypeScript 5.8, `@supabase/supabase-js` 2.105 browser client, existing V2 `/api/phone-upload`, existing `/api/generate`, existing analytics and attribution endpoints, CSS and DOM APIs, Vitest 4, current Inter and brand tokens.

**Spec:** `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`

## Global Constraints

- `/app` and `/app/auth/callback` are same-origin authenticated routes with `noindex, nofollow`, no public canonical, no public structured data, and no sitemap entries.
- `/auth/callback` remains the extension callback and is never imported or redirected to by the web client.
- Google OAuth and one email request are the only sign-in choices. The email contains both the Supabase action link and a six-digit OTP.
- Browser Supabase configuration uses session persistence, automatic refresh, and URL-session detection. Tokens never enter analytics, DOM text, URLs after callback cleanup, or logs.
- All API calls use `Authorization: Bearer <access token>`. A 401 refreshes once and repeats the original read or upload request once. Generation is never replayed with a new request ID.
- The app consumes `GET /api/user/usage`, V2 phone upload, and the existing one-call `/api/generate` contract. It never reads Supabase tables from the browser.
- All selected photos for one item are preserved in order. There is no arbitrary UI photo-count cap. Each upload request contains one file and uses the existing 4 MB server limit.
- Preparation is the existing 1280 px longest-dimension JPEG quality 0.8 path with `createImageBitmap` fallback and orientation transforms where supported. HEIC and orientation are real-device launch gates.
- Upload concurrency is three, not batch-item concurrency. Seller notes, history, batch generation, offline storage, service workers, share targets, native Vinted handoff, and source-photo persistence are out of scope.
- Formatting defaults are Long and Bullets. Title and description language are independent and persisted under the shared semantic keys `selectedTitleLanguage`, `selectedDescriptionLanguage`, and `selectedLanguage`.
- The app uses `descriptionLength` and `useBulletPoints` fields, preserves generated text locally only, and copies one selected field at a time.
- Vinted navigation uses the existing market mapping and `/items/new` HTTPS path. It does not promise native-app opening or field injection.
- Billing uses bearer-owned existing Stripe products and returns to `/app`; subscription state is refreshed from `/api/user/usage` after webhook propagation.
- Analytics sends `source: "mobile_web"` and bounded `web_app_click` or app event contexts. It never sends raw images, signed URLs, filenames, tokens, emails, or generated full text.
- No production deployment, Supabase redirect change, Stripe live checkout, CSP change, or Vercel environment mutation is part of implementation. Those are release-owner gates after preview and real-device checks.
- Use existing Astro, CSS, TypeScript, and Vitest dependencies. Do not add React, a service worker, IndexedDB, Cache Storage, or a browser test dependency without explicit approval.
- Run commands from `/home/mests/projects/quick-vint-api`; preserve unrelated dirty files and stage only files owned by the current task.

## Review Focus

1. Google, magic-link, and OTP flows must land only in the web callback and refresh the browser session without leaking tokens. Pin this to `auth_callback_cleans_url_and_uses_web_session` in Task 1.
2. No Vinted hostname must still produce the shared browser-language fallback and the exact 18 output-language order. Pin this to `language_defaults_use_shared_script_and_persist_independently` in Task 2.
3. A selection larger than three files must preserve order while only three uploads are active, and every terminal path must revoke previews and clean the V2 session. Pin this to `upload_preserves_order_and_cleans_up_after_abort` in Task 3.
4. A 401 refreshes once, while a 504 retains the same idempotency request ID and does not silently charge a second generation. Pin this to `generation_retries_auth_once_but_not_unknown_writes` in Task 4.
5. Checkout, copy, Vinted, attribution, and analytics must use server and browser-safe values only. Pin this to `billing_copy_vinted_and_events_redact_sensitive_values` in Task 5.

---

## File structure map

| File                                                    | Responsibility                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/app/index.astro`                             | Private app document, app noindex, static shell mount, browser script and public-flag handoff. It does not use `SiteLayout` and therefore cannot inherit extension schema. |
| `src/pages/app/auth/callback.astro`                     | Private callback document and callback script mount. It has no app data fetch and no public schema.                                                                        |
| `src/app/mobile-web/types.ts`                           | Session, usage, photo, generation, billing, and state-machine types shared by client modules.                                                                              |
| `src/app/mobile-web/auth.ts`                            | Browser Supabase client, Google sign-in, magic-link request, OTP verification, callback completion, session refresh, and sign-out.                                         |
| `src/app/mobile-web/api.ts`                             | Same-origin fetch wrapper, bearer header, one-refresh 401 policy, response parsing, and typed status errors.                                                               |
| `src/app/mobile-web/language.ts`                        | Adapter for `/ui-components/language-defaults.js`, browser storage keys, 18 output-language labels and flags, and independent preference resolution.                       |
| `src/app/mobile-web/formatting.ts`                      | Long/Short and Bullets/Paragraphs controls, defaults, and `descriptionLength` and `useBulletPoints` serialization.                                                         |
| `src/app/mobile-web/imagePreparation.ts`                | File decode, EXIF orientation, 1280 px JPEG quality 0.8 preparation, object URL lifecycle, and HEIC recovery classification.                                               |
| `src/app/mobile-web/uploadClient.ts`                    | V2 single-session open, prepare, three-concurrent one-file uploads, ordered completion, abort, status, and cleanup.                                                        |
| `src/app/mobile-web/generationClient.ts`                | One-call mobile generation payload, request UUID, idempotency headers, response parser, safe error categories, and usage refresh trigger.                                  |
| `src/app/mobile-web/billing.ts`                         | Bearer checkout and portal calls, bounded return status, and post-return usage refresh.                                                                                    |
| `src/app/mobile-web/analytics.ts`                       | First-touch capture/claim bridge and bounded mobile web event payloads.                                                                                                    |
| `src/app/mobile-web/app.ts`                             | Authenticated state machine, DOM event wiring, progress, result editing, copy feedback, Vinted action, and route cleanup.                                                  |
| `src/components/mobile-web/WorkspaceShell.astro`        | Shared semantic app workspace markup used by `/app` and the later approved landing sample.                                                                                 |
| `src/components/mobile-web/PhotoRail.astro`             | Ordered photo preview rail and accessible add, replace, remove, and capture controls.                                                                                      |
| `src/components/mobile-web/ListingControls.astro`       | Independent language and formatting controls with data attributes for the client.                                                                                          |
| `src/components/mobile-web/ListingResult.astro`         | Editable title and description fields, copy buttons, safety note, and Vinted action.                                                                                       |
| `src/styles/mobile-web-app.css`                         | Prototype-faithful responsive layout, 44 px touch targets, focus states, skeleton, error, and quota surfaces using existing brand tokens.                                  |
| `src/app/mobile-web/__tests__/auth.test.ts`             | Supabase OAuth, email, OTP, callback cleanup, session refresh, and token redaction tests.                                                                                  |
| `src/pages/__tests__/mobileWebRoute.test.ts`            | Astro route source and noindex, no-schema, callback-boundary contract tests.                                                                                               |
| `src/app/mobile-web/__tests__/language.test.ts`         | Shared script adapter, 18-language order, flag mapping, browser fallback, and persistence tests.                                                                           |
| `src/app/mobile-web/__tests__/uploadClient.test.ts`     | Compression handoff, V2 URLs, order, concurrency, abort, expiry, and cleanup tests.                                                                                        |
| `src/app/mobile-web/__tests__/generationClient.test.ts` | Payload shape, one-call response, 401, 403, 429, 400, 413, 415, 5xx, 504, and idempotency behavior.                                                                        |
| `src/app/mobile-web/__tests__/billingAnalytics.test.ts` | Bearer checkout, usage refresh, attribution propagation, event redaction, clipboard fallback, and Vinted mapping tests.                                                    |
| `src/app/mobile-web/__tests__/releaseContract.test.ts`  | Static build contract for private routes, unsupported out-of-scope features, and shared component selectors.                                                               |

## Dependencies and execution order

Task 1 establishes the private Astro documents, browser session, and API wrapper. Task 2 consumes the session storage adapter and adds controls. Task 3 consumes the bearer API wrapper and prepares the V2 upload client. Task 4 consumes usage, language, formatting, and upload results and owns the generation state machine. Task 5 consumes the stable result surface and backend billing and analytics contracts. Task 6 integrates the responsive shell and runs browser-like static contracts and real-device gates. The acquisition plan starts only after Task 6's preview and device checks are green, then imports the shared mobile-web presentation components without adding public generation calls.

### Task 1: Private Astro shell and Supabase browser auth

**Files:**

- Create: `src/pages/app/index.astro`
- Create: `src/pages/app/auth/callback.astro`
- Create: `src/app/mobile-web/types.ts`
- Create: `src/app/mobile-web/auth.ts`
- Create: `src/app/mobile-web/api.ts`
- Test: `src/app/mobile-web/__tests__/auth.test.ts`
- Test: `src/pages/__tests__/mobileWebRoute.test.ts`

**Interfaces:**

- Produces `createBrowserSupabaseClient()`, `signInWithGoogle()`, `requestMagicLink(email)`, `verifyEmailOtp(email, token)`, `completeWebCallback(url)`, `getBrowserSession()`, `refreshBrowserSession()`, `signOutBrowser()`, and `fetchMobileJson(path, init, options?: { retryOn401?: boolean })`.
- `fetchMobileJson` returns parsed JSON or throws `MobileApiError { status: number; code: string; message: string; retryable: boolean }`. It retries one original request after a successful `refreshSession` only when `retryOn401` is true, never more than once. `generationClient.ts` uses the same request ID and sets this option explicitly so a 401 can be retried safely, while an unknown 5xx or 504 response is never replayed with a new request.
- Consumes backend Task 1 callback path and Task 2 usage endpoint. It does not import `public/auth-callback.js`.

- [ ] **Step 1: Write failing auth and route tests.**

```ts
it("uses the web callback for Google and strips callback credentials", async () => {
  await signInWithGoogle();
  expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: "google",
    options: { redirectTo: "https://autolister.app/app/auth/callback" },
  });
  await completeWebCallback(
    new URL(
      "https://autolister.app/app/auth/callback?code=abc#access_token=secret",
    ),
  );
  expect(history.replaceState).toHaveBeenCalledWith({}, "", "/app");
  expect(document.body.textContent).not.toContain("secret");
});

it("refreshes once on 401 and never retries a generation with a new request", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response("", { status: 401 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  await fetchMobileJson("/api/user/usage", { method: "GET" });
  expect(refreshBrowserSession).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npx vitest run src/app/mobile-web/__tests__/auth.test.ts src/pages/__tests__/mobileWebRoute.test.ts`

Expected: FAIL because `/app`, the web callback, and browser modules do not exist.

- [ ] **Step 3: Implement the browser client and private documents.**

Create the Supabase client with `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, and the configured public URL and anon key. `signInWithGoogle` uses `${location.origin}/app/auth/callback`; `requestMagicLink` posts `{ email, client: "mobile_web" }`; `verifyEmailOtp` calls `verifyOtp({ email, token, type: "email" })`. `completeWebCallback` exchanges a PKCE `code` when present, accepts the configured hash session form when present, replaces the URL with `/app`, and returns the session without logging tokens.

The Astro documents use a private minimal `<!doctype html>` shell, `<meta name="robots" content="noindex, nofollow">`, a mount element, the approved brand stylesheet, and the appropriate module script. They contain no canonical, JSON-LD, extension callback script, or generation request. The callback redirects to `/app` only after `completeWebCallback` succeeds.

- [ ] **Step 4: Run auth and route tests plus a production build.**

Run: `npx vitest run src/app/mobile-web/__tests__/auth.test.ts src/pages/__tests__/mobileWebRoute.test.ts && npm run build`

Expected: PASS, with `dist/app/index.html` and `dist/app/auth/callback/index.html` containing noindex and no public schema. Build must complete without adding a React integration.

- [ ] **Step 5: Commit the private shell.**

```bash
git add src/pages/app src/app/mobile-web/types.ts src/app/mobile-web/auth.ts src/app/mobile-web/api.ts src/app/mobile-web/__tests__/auth.test.ts src/pages/__tests__/mobileWebRoute.test.ts
git commit -m "feat: add authenticated mobile app shell"
```

### Task 2: Shared language and formatting controls

**Files:**

- Create: `src/app/mobile-web/language.ts`
- Create: `src/app/mobile-web/formatting.ts`
- Test: `src/app/mobile-web/__tests__/language.test.ts`
- Create: `src/components/mobile-web/ListingControls.astro`

**Interfaces:**

- Produces `loadLanguageDefaults()`, `resolveMobileLanguagePreferences(storage)`, `SUPPORTED_OUTPUT_LANGUAGES`, `getLanguageLabel(code)`, `getLanguageFlag(code)`, `readFormattingPreferences(storage)`, and `serializeFormattingPreferences(value)`.
- `resolveMobileLanguagePreferences` calls the existing `/ui-components/language-defaults.js` global with an empty hostname, then persists `selectedLanguage`, `selectedTitleLanguage`, and `selectedDescriptionLanguage` in browser storage. It never uses the prototype keys `autolister-title-language` or `autolister-description-language`.
- Produces 18 codes in this exact order: `en, fr, cz, da, nl, de, el, hr, fi, hu, it, lt, pl, pt, ro, es, sk, sv`. `cs` normalizes to `cz`.

- [ ] **Step 1: Write failing tests for fallback, independent persistence, flags, and formatting defaults.**

```ts
it("uses browser fallback without a Vinted hostname and keeps languages independent", () => {
  const result = resolveMobileLanguagePreferences({
    navigatorLanguages: ["de-DE"],
    hostname: "",
  });
  expect(result.titleLanguageCode).toBe("de");
  expect(result.descriptionLanguageCode).toBe("de");
  const changed = resolveMobileLanguagePreferences({
    storage: {
      selectedTitleLanguage: "fr",
      selectedDescriptionLanguage: "it",
      quickvintLanguagePreferenceTouched: "true",
    },
    hostname: "",
  });
  expect(changed.titleLanguageCode).toBe("fr");
  expect(changed.descriptionLanguageCode).toBe("it");
});

it("keeps the shared 18-language order and defaults to long bullets", () => {
  expect(SUPPORTED_OUTPUT_LANGUAGES.map((language) => language.code)).toEqual([
    "en",
    "fr",
    "cz",
    "da",
    "nl",
    "de",
    "el",
    "hr",
    "fi",
    "hu",
    "it",
    "lt",
    "pl",
    "pt",
    "ro",
    "es",
    "sk",
    "sv",
  ]);
  expect(readFormattingPreferences({})).toEqual({
    descriptionLength: "long",
    useBulletPoints: true,
  });
});
```

- [ ] **Step 2: Run the language test to verify it fails.**

Run: `npx vitest run src/app/mobile-web/__tests__/language.test.ts`

Expected: FAIL because no browser adapter, language list, or formatting serializer exists.

- [ ] **Step 3: Implement the adapter and control markup.**

Load `/ui-components/language-defaults.js` once and call `window.AutoListerLanguageDefaults.resolveLanguageProfile(storage, { hostname: "", navigatorLanguages, navigatorLanguage })`. Map `cs` to `cz`, use the existing flag convention with the Czech flag for `cz`, and store only the shared semantic keys. Render title and description selectors as separate controls. Render a bottom sheet or equivalent accessible dialog with `short`, `long`, `useBulletPoints: false`, and `useBulletPoints: true`; default to Long and Bullets and persist `descriptionLength` and `useBulletPoints`.

- [ ] **Step 4: Run focused tests and type-check.**

Run: `npx vitest run src/app/mobile-web/__tests__/language.test.ts && npm run type-check`

Expected: PASS. The test proves the adapter uses no Vinted hostname, independent fields, exact 18-language order, and the approved defaults.

- [ ] **Step 5: Commit controls.**

```bash
git add src/app/mobile-web/language.ts src/app/mobile-web/formatting.ts src/components/mobile-web/ListingControls.astro src/app/mobile-web/__tests__/language.test.ts
git commit -m "feat: add mobile language and format controls"
```

### Task 3: Image preparation and ordered V2 upload

**Files:**

- Create: `src/app/mobile-web/imagePreparation.ts`
- Create: `src/app/mobile-web/uploadClient.ts`
- Create: `src/app/mobile-web/__tests__/uploadClient.test.ts`
- Create: `src/components/mobile-web/PhotoRail.astro`

**Interfaces:**

- Produces `prepareImage(file: File): Promise<{ file: File; previewUrl: string; sourceType: string; recoveredOrientation: boolean }>`, `revokePreview(url)`, `openSingleUpload(session)`, `uploadSelectedPhotos(session, photos, signal)`, and `cleanupUploadSession(sessionId, reason)`.
- `openSingleUpload` calls `POST /api/phone-upload?action=open&v=2&mode=single&sessionId=<uuid>` with the bearer token. The client then calls `POST /api/phone-upload?action=prepare&sessionId=<uuid>&expectedCount=<n>&v=2&uploaderId=<uuid>`, uploads one multipart file to `/api/phone-upload?v=2&sessionId=<uuid>&expectedCount=<n>` with `uploadOrder`, completes with ordered `orders`, and uses the returned signed URLs.
- Consumes `fetchMobileJson` from Task 1. Produces ordered `{ url, order }[]` for generation and no raw data for analytics.

- [ ] **Step 1: Write failing tests for compression handoff, order, concurrency, HEIC, abort, and cleanup.**

```ts
it("uploads six selected files in order with at most three active requests", async () => {
  const requests = deferredUploadResponses(6);
  const result = await uploadSelectedPhotos(
    session,
    selectedFiles(6),
    new AbortController().signal,
  );
  expect(maxConcurrentMultipartRequests()).toBe(3);
  expect(result.map((photo) => photo.order)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(completeRequest.body.orders).toEqual([0, 1, 2, 3, 4, 5]);
});

it("aborts requests, revokes previews, and cleans the V2 session", async () => {
  const controller = new AbortController();
  const promise = uploadSelectedPhotos(
    session,
    selectedFiles(2),
    controller.signal,
  );
  controller.abort();
  await expect(promise).rejects.toMatchObject({ code: "aborted" });
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  expect(cleanupFetch).toHaveBeenCalledWith(
    expect.stringContaining("action=cleanup"),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run upload tests to verify they fail.**

Run: `npx vitest run src/app/mobile-web/__tests__/uploadClient.test.ts`

Expected: FAIL because image preparation and V2 client modules do not exist.

- [ ] **Step 3: Implement preparation by extracting the existing browser behavior.**

Decode with `createImageBitmap` when available and an `Image` element otherwise, apply exposed EXIF orientation transforms, constrain the longest dimension to 1280, encode `image/jpeg` at quality `0.8`, create one preview object URL, and revoke it on replacement, removal, completion, cancellation, unmount, and route change. If HEIC or HEIF cannot decode, return a typed `unsupported-heic` error that preserves the remaining selected files and offers replacement. Do not persist files in IndexedDB or Cache Storage.

- [ ] **Step 4: Implement the authenticated V2 client with a three-worker queue.**

Generate UUID session and uploader IDs, open `mode=single`, prepare the exact selected count, compress before multipart upload, schedule at most three active requests, pass the original order, retry only transport or server retry statuses that do not indicate session expiry, complete with all orders, and map signed URLs in order. Use `AbortController`; on abort, expiry, route change, or terminal error, call cleanup best effort and revoke every preview. Never introduce a UI file-count cap and never send more than one file per request.

- [ ] **Step 5: Run upload tests, phone-upload regressions, and type-check.**

Run: `npx vitest run src/app/mobile-web/__tests__/uploadClient.test.ts src/api/__tests__/phoneUpload.test.ts src/pages/__tests__/phoneUploadHtml.test.ts && npm run type-check`

Expected: PASS. Existing phone upload behavior remains green, and the new client proves order, concurrency three, 4 MB recovery mapping, HEIC recovery, abort, and cleanup.

- [ ] **Step 6: Commit the upload client.**

```bash
git add src/app/mobile-web/imagePreparation.ts src/app/mobile-web/uploadClient.ts src/components/mobile-web/PhotoRail.astro src/app/mobile-web/__tests__/uploadClient.test.ts
git commit -m "feat: add ordered mobile photo upload client"
```

### Task 4: Generation, usage, and recovery state machine

**Files:**

- Create: `src/app/mobile-web/generationClient.ts`
- Create: `src/app/mobile-web/__tests__/generationClient.test.ts`
- Create: `src/components/mobile-web/WorkspaceShell.astro`
- Modify: `src/app/mobile-web/app.ts: authenticated flow integration`

**Interfaces:**

- Produces `loadUsage()`, `generateListing(input)`, and a discriminated `MobileGenerationState` with `idle`, `uploading`, `generating`, `success`, `quota`, and `error` states.
- `generateListing` sends one JSON request to `/api/generate` with `imageUrls`, `titleLanguageCode`, `descriptionLanguageCode`, `descriptionLength`, `useBulletPoints`, `generationMode: "manual"`, and a UUID `X-Autolister-Request-Id` plus `X-Autolister-Client: mobile_web`.
- Consumes ordered signed URLs from Task 3, controls from Task 2, and usage endpoint from Task 1. Produces `{ title, description, measurementAdvice?, offers? }` without server history.

- [ ] **Step 1: Write failing tests for payload, one-call output, status mapping, and idempotent unknown responses.**

```ts
it("sends independent languages and parses title and description from one response", async () => {
  const result = await generateListing({
    imageUrls: ["signed-url"],
    titleLanguageCode: "fr",
    descriptionLanguageCode: "it",
    descriptionLength: "short",
    useBulletPoints: false,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    titleLanguageCode: "fr",
    descriptionLanguageCode: "it",
    descriptionLength: "short",
    useBulletPoints: false,
  });
  expect(result).toEqual(
    expect.objectContaining({
      title: expect.any(String),
      description: expect.any(String),
    }),
  );
});

it("refreshes auth once but keeps the same request id after a 504", async () => {
  fetchMock.mockResolvedValueOnce(new Response("", { status: 504 }));
  const error = await expect(generateListing(input)).rejects.toMatchObject({
    status: 504,
    retryable: true,
  });
  expect(error).toBeDefined();
  const requestIds = requestHeadersFromAllCalls().map((headers) =>
    headers.get("X-Autolister-Request-Id"),
  );
  expect(new Set(requestIds).size).toBe(1);
});
```

- [ ] **Step 2: Run generation tests to verify they fail.**

Run: `npx vitest run src/app/mobile-web/__tests__/generationClient.test.ts`

Expected: FAIL because the generation client and state machine do not exist.

- [ ] **Step 3: Implement one-call generation and typed recovery.**

Use the exact backend field names, default `tone`, emoji, hashtag, and footer values already accepted by `/api/generate`, and never split title and description into two requests. Disable the generate action while a request is in flight. On 401, refresh once through the API wrapper. Map 403 and 429 to a usage refresh and server message, 400 to retained settings and photos, 413 to a per-photo compression or replacement action, 415 to a typed unsupported-photo action, and 5xx or 504 to a retained request ID and manual same-key retry. Do not generate a fresh key after an unknown write result.

- [ ] **Step 4: Implement usage and DOM state transitions.**

Fetch `/api/user/usage` after auth, after successful generation, after quota errors, and after checkout return. Show the server plan, remaining value, and reset text. Keep selected files and controls on recoverable errors. Render an honest indeterminate skeleton while generating and never display a fake success result. Escape generated text before insertion.

- [ ] **Step 5: Run focused generation, usage, and full type checks.**

Run: `npx vitest run src/app/mobile-web/__tests__/generationClient.test.ts src/app/mobile-web/__tests__/auth.test.ts && npm run type-check`

Expected: PASS. Tests cover one fetch, independent fields, server status truth, one auth refresh, same-key unknown-write recovery, and retained photos/settings.

- [ ] **Step 6: Commit the generation state machine.**

```bash
git add src/app/mobile-web/generationClient.ts src/app/mobile-web/app.ts src/components/mobile-web/WorkspaceShell.astro src/app/mobile-web/__tests__/generationClient.test.ts
git commit -m "feat: add mobile generation state machine"
```

### Task 5: Editable result, clipboard, Vinted action, billing, analytics, and attribution

**Files:**

- Create: `src/app/mobile-web/billing.ts`
- Create: `src/app/mobile-web/analytics.ts`
- Create: `src/app/mobile-web/__tests__/billingAnalytics.test.ts`
- Create: `src/components/mobile-web/ListingResult.astro`
- Modify: `src/app/mobile-web/app.ts: result and billing event wiring`

**Interfaces:**

- Produces `copyListingField(field, text)`, `getVintedCreateUrl(hostname)`, `startMobileCheckout(tier)`, `openMobilePortal()`, `refreshAfterCheckout()`, `trackMobileEvent(event, context)`, and `claimFirstTouchAfterAuth(session)`.
- Consumes existing `language-defaults.js` market mapping, `/api/stripe/create-checkout`, `/api/stripe/create-portal`, `/api/user/usage`, `/api/events/track`, and `/api/attribution/claim`.
- Produces no full-text analytics and no saved history.

- [ ] **Step 1: Write failing tests for copy fallback, market URL, bearer billing, attribution propagation, and redaction.**

```ts
it("copies only the selected field and falls back when Clipboard API is absent", async () => {
  const result = await copyListingField("title", "Blue dress");
  expect(result).toBe("copied");
  expect(clipboardWriteText).toHaveBeenCalledWith("Blue dress");
  expect(trackMobileEvent).toHaveBeenCalledWith(
    "copy",
    expect.objectContaining({ field: "title" }),
  );
  expect(trackMobileEvent).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ text: expect.any(String) }),
  );
});

it("maps a Vinted host to HTTPS create-item navigation and redacts analytics", () => {
  expect(getVintedCreateUrl("www.vinted.fr")).toBe(
    "https://www.vinted.fr/items/new",
  );
  trackMobileEvent("generation_success", {
    imageCount: 2,
    accessToken: "secret",
    description: "private",
  });
  expect(fetchMock.mock.calls.at(-1)?.[1].body).not.toContain("secret");
  expect(fetchMock.mock.calls.at(-1)?.[1].body).not.toContain("private");
});
```

- [ ] **Step 2: Run billing and result tests to verify they fail.**

Run: `npx vitest run src/app/mobile-web/__tests__/billingAnalytics.test.ts`

Expected: FAIL because result, billing, analytics, and attribution modules do not exist.

- [ ] **Step 3: Implement result editing and clipboard fallback.**

Render title and description as local editable fields, keep a non-copy safety note outside both values, copy only the requested field with `navigator.clipboard.writeText`, and fall back to a temporary hidden textarea with selection and `document.execCommand("copy")` when the Clipboard API is unavailable. Show accessible copied or failed feedback and emit only field name and result status.

- [ ] **Step 4: Implement market mapping and web billing.**

Use the shared language-defaults market mapping, map approved Vinted domains to `https://<host>/items/new`, reject unknown hosts rather than constructing a URL from arbitrary input, and navigate normally. Post only `{ tier, source: "mobile_web", utm }` with the bearer token to checkout, send no client email or user ID, use the portal branch for paid users, return to `/app`, and refresh usage with bounded backoff after the Stripe webhook has time to update the profile.

- [ ] **Step 5: Implement attribution and bounded event transport.**

Load existing first-touch state from `autolister.first_touch.v1`, preserve sanitized `ref` and UTM values through `/app` and checkout, call the existing claim endpoint after auth best effort, and send `source: "mobile_web"` with `web_app_click`, `auth_complete`, `upload_complete`, `generation_success`, `generation_error`, `copy`, `vinted_click`, `checkout_start`, and `checkout_return` contexts. Strip tokens, emails, image URLs, filenames, generated text, and arbitrary query keys before serialization.

- [ ] **Step 6: Run focused tests and type-check.**

Run: `npx vitest run src/app/mobile-web/__tests__/billingAnalytics.test.ts src/api/__tests__/eventsTrack.test.ts src/api/__tests__/attributionClaim.test.ts && npm run type-check`

Expected: PASS. Existing event and attribution contracts remain green, and new tests prove safe copy, Vinted URL mapping, bearer billing, first-touch preservation, and redaction.

- [ ] **Step 7: Commit the result and monetization surface.**

```bash
git add src/app/mobile-web/billing.ts src/app/mobile-web/analytics.ts src/app/mobile-web/app.ts src/components/mobile-web/ListingResult.astro src/app/mobile-web/__tests__/billingAnalytics.test.ts
git commit -m "feat: add mobile result billing and analytics"
```

### Task 6: Prototype-faithful responsive shell and launch gates

**Files:**

- Create: `src/styles/mobile-web-app.css`
- Create: `src/app/mobile-web/__tests__/releaseContract.test.ts`
- Modify: `src/components/mobile-web/WorkspaceShell.astro: final shared shell markup and sample mode`
- Modify: `src/components/mobile-web/PhotoRail.astro: final ordered controls and touch states`
- Modify: `src/pages/app/index.astro: shared shell and stylesheet`
- Modify: `src/app/mobile-web/app.ts: DOM event wiring and terminal cleanup`

**Interfaces:**

- Produces stable `data-mobile-web-*` selectors for the app client and public acquisition sample. `WorkspaceShell` accepts `mode: "interactive" | "sample"`; sample mode accepts reviewed `photo`, `title`, `description`, and `disclosure` props and never mounts auth, upload, generation, or billing scripts. The shared components expose photo rail, controls, generation canvas, editable result, quota card, auth card, and checkout return surfaces without embedding secrets or live sample output.
- Consumes all client modules from Tasks 1 through 5 and the approved prototype as a visual reference only. It does not copy prototype-local sample assets or localStorage keys.

- [ ] **Step 1: Write failing static contract tests for shell selectors, touch targets, and out-of-scope exclusions.**

```ts
it("exposes the approved app surfaces and excludes unsupported PWA features", () => {
  const source = readFileSync(
    "src/components/mobile-web/WorkspaceShell.astro",
    "utf8",
  );
  expect(source).toContain('data-mobile-web="workspace"');
  expect(source).toContain('data-mobile-web="photo-rail"');
  expect(source).toContain('data-mobile-web="listing-result"');
  expect(source).not.toContain("serviceWorker");
  expect(source).not.toContain("indexedDB");
});

it("keeps app documents private", () => {
  const html = readFileSync("src/pages/app/index.astro", "utf8");
  expect(html).toContain('name="robots" content="noindex, nofollow"');
  expect(html).not.toContain("application/ld+json");
});
```

- [ ] **Step 2: Run the release contract test to verify it fails.**

Run: `npx vitest run src/app/mobile-web/__tests__/releaseContract.test.ts`

Expected: FAIL because the shared production shell and selectors do not exist.

- [ ] **Step 3: Implement the responsive shared markup and CSS.**

Use existing Inter and brand indigo tokens, one filled generate or auth primary per state, 44 px minimum controls, safe-area padding, keyboard-visible focus, bottom-sheet controls on narrow screens, a two-column result workspace on wide screens, honest skeleton and error states, and a sticky Vinted action only after a successful result. Keep the visual hierarchy and copy language from the approved prototype without importing React or its fake sample assets. Add `prefers-reduced-motion` behavior.

- [ ] **Step 4: Mount app state and clean every terminal resource.**

Wire selectors to auth, usage, controls, photo rail, upload, generation, result, copy, billing, and analytics modules. On sign-out, route change, unmount, abort, upload completion, generation completion, and fatal error, revoke object URLs, clear file references, abort active requests, and call V2 cleanup best effort. Preserve files and settings on recoverable 400, 413, 415, 403, 429, 5xx, and 504 states.

- [ ] **Step 5: Run static contracts, build, and the full deterministic suite.**

Run: `npx vitest run src/app/mobile-web/__tests__/releaseContract.test.ts src/app/mobile-web/__tests__/auth.test.ts src/app/mobile-web/__tests__/language.test.ts src/app/mobile-web/__tests__/uploadClient.test.ts src/app/mobile-web/__tests__/generationClient.test.ts src/app/mobile-web/__tests__/billingAnalytics.test.ts && npm run verify:production`

Expected: PASS. The build emits private app documents, no new service worker or persistence layer appears, and all existing backend and site tests remain green.

- [ ] **Step 6: Run preview and real-device launch checks without deployment.**

Run: `npm run build && npm run preview -- --host 0.0.0.0`

Expected: the preview serves `/app` and its callback without public schema, and the release owner can test Google OAuth, the email link and OTP, session refresh, HEIC, EXIF orientation, large compressed photos, cancellation, copy fallback, quota refresh, checkout return, and Vinted HTTPS navigation on iPhone Safari and Android Chrome. A native Vinted app opening is not marked as verified.

- [ ] **Step 7: Commit the client launch surface.**

```bash
git add src/pages/app src/components/mobile-web src/styles/mobile-web-app.css src/app/mobile-web/app.ts src/app/mobile-web/__tests__/releaseContract.test.ts
git commit -m "feat: finish mobile web app client shell"
```

## Handoff and release boundary

The acquisition SEO plan may consume `WorkspaceShell.astro`, `PhotoRail.astro`, `ListingControls.astro`, `ListingResult.astro`, and `mobile-web-app.css` only after Task 6 passes preview and real-device gates. It must use a reviewed static sample and never call `/api/generate` for visitors. This plan intentionally omits seller-note sync, history, batch, offline, service worker, IndexedDB, share target, native handoff, and anonymous generation. No public CTA or sitemap entry is enabled by this plan.
