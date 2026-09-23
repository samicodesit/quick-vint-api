# Authenticated Mobile Web App Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated `/app` single-item browser flow with the approved mobile interaction model, using the backend foundation without creating a second auth, quota, generation, or storage system.

**Architecture:** The app is a private static Astro shell with a vanilla TypeScript state machine. Supabase owns the persisted browser session, a small same-origin API client owns bearer refresh and typed errors, and V2 phone upload remains the temporary photo transport. The client preserves selected-file order, performs one generation call returning title and description, and keeps results editable only in the current browser session.

**Tech Stack:** Astro 5 static pages, TypeScript 5.8, the existing `@supabase/supabase-js` 2.105 dependency in the API package, V2 `/api/phone-upload`, `/api/generate`, `/api/user/usage`, existing analytics and attribution endpoints, CSS and DOM APIs, Vitest 4, and the repository's current Inter and brand tokens.

**Spec:** `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`

## Global Constraints

- `/app` and `/app/auth/callback` are same-origin private documents with `noindex, nofollow`, no public canonical, no public JSON-LD, and no sitemap entry. The SEO plan owns built sitemap exclusions.
- `/auth/callback` remains the extension callback and is never imported, redirected to, or modified by the web client.
- Google OAuth and one email request are the only sign-in choices. The one email contains the Supabase action link and six-digit OTP. The web callback alone handles both forms.
- Browser Supabase configuration uses `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`. Tokens never enter analytics, DOM text, URLs after callback cleanup, or logs.
- `PUBLIC_MOBILE_WEB_APP_ENABLED === "true"` is the only enabled build value. When false or absent, the private documents render a disabled notice and do not load auth, upload, generation, billing, or analytics client modules. CTAs remain disabled until the release gate enables the flag.
- An enabled build validates `PUBLIC_SUPABASE_URL` as an HTTPS origin without credentials or a non-root path and validates a non-empty `PUBLIC_SUPABASE_ANON_KEY`. Validation failures are build errors without printing either value. Do not install another Supabase package: `@supabase/supabase-js` 2.105 already exists in this repository.
- All API calls use `Authorization: Bearer <access token>`. A 401 refreshes once and repeats the same safe read or upload request once; a second 401 signs out locally and returns to the auth card. A generation retry after an unknown 5xx or 504 retains the same idempotency request ID and never silently submits a new generation.
- The app consumes `GET /api/user/usage`, V2 phone upload, and the existing one-call `/api/generate`. It never reads Supabase tables from the browser and never duplicates quota or pricing logic.
- Every selected photo is preserved in original order. There is no arbitrary UI photo-count cap. V2 sends one file per request under the current 4 MB server limit. The app queue intentionally uses three workers; the existing phone-upload page remains at its current concurrency of two.
- Image preparation is an isolated app helper based on the current 1280 px longest-dimension JPEG quality 0.8 behavior. Standard image handling currently assumes orientation 1, the DNG path exposes orientation, and HEIC failure currently falls back to the original. Typed recovery may improve those paths, but HEIC, orientation, and large-file behavior are real-device gates.
- Source files, signed URLs, result text, and seller notes are not persisted to IndexedDB, Cache Storage, history, or a service worker. Seller-note sync, history, batch, offline, share target, and native Vinted handoff are out of scope.
- Formatting defaults are Long and Bullets. Title and description languages are independent and persisted under the shared semantic keys `selectedLanguage`, `selectedTitleLanguage`, and `selectedDescriptionLanguage`. The shared defaults script supplies resolution only, not labels or flags.
- Vinted navigation uses the safe country-to-domain mapping from `utils/vintedRedirect.ts` and the HTTPS `/items/new` path. It does not promise app opening, deep links, or field injection.
- Billing uses bearer-owned existing Stripe products, returns to `/app`, and refreshes usage after webhook propagation. The client never submits an email, profile ID, Stripe customer ID, or arbitrary return URL for ownership.
- Analytics adds a bounded mobile-web allowlist around existing endpoints. It sends `source: "mobile_web"`, `web_app_click`, and approved app contexts only. It never sends raw photos, signed URLs, filenames, tokens, emails, or generated full text.
- Do not modify Supabase redirect configuration, Stripe live data, Vercel environment values, or production deployment in implementation tasks. Those are release-owner gates after preview and device validation.
- Use existing Astro, CSS, TypeScript, and Vitest dependencies. Do not add React, a service worker, IndexedDB, Cache Storage, or browser-test dependencies without explicit approval.
- Use `pnpm` commands from `/home/mests/projects/quick-vint-api`; preserve unrelated dirty files and stage only files owned by the current task.

## Review Focus

1. Google, magic-link, and OTP flows must land only in the web callback, clean the URL, and refresh the browser session without leaking tokens. Pin this to the named test `auth_callback_cleans_url_and_uses_web_session` in Task 1.
2. No Vinted hostname must still produce the shared browser-language fallback and the exact 18 output-language order with independent persistence. Pin this to `language_defaults_use_shared_script_and_persist_independently` in Task 2.
3. More than three selected files must preserve order while only three uploads are active, and cancellation must use the V2 cancellation cleanup without destroying a completed upload before generation. Pin this to `upload_preserves_order_and_cleans_up_after_abort` in Task 3.
4. A 401 refreshes once, while a 504 retains the same idempotency request ID and does not silently charge a second generation. Pin this to `generation_retries_auth_once_but_not_unknown_writes` in Task 4.
5. Checkout, copy, Vinted, attribution, and analytics must use server and browser-safe values only. Pin this to `billing_copy_vinted_and_events_redact_sensitive_values` in Task 5.

---

## File structure map

| File                                                    | Responsibility                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/app/index.astro`                             | Private app document, noindex metadata, exact CSP meta construction, static shell mount, and build-time flag handoff. It does not use `SiteLayout` and cannot inherit extension schema. |
| `src/pages/app/auth/callback.astro`                     | Private callback document, noindex metadata, callback mount, and no public schema.                                                                                                      |
| `src/app/mobile-web/config.ts`                          | Exact build-time flag and Supabase URL/anon-key validation. It does not log values.                                                                                                     |
| `src/app/mobile-web/types.ts`                           | Session, usage, photo, generation, billing, and state-machine types that match backend Tasks 1 through 5.                                                                               |
| `src/app/mobile-web/auth.ts`                            | Browser Supabase client, Google sign-in, magic-link request, six-digit OTP verification, callback completion, session refresh, and sign-out.                                            |
| `src/app/mobile-web/api.ts`                             | Same-origin fetch wrapper, bearer header, one-refresh 401 policy, and typed status errors.                                                                                              |
| `src/app/mobile-web/language.ts`                        | Adapter for `/ui-components/language-defaults.js`, browser storage, navigator and hostname inputs, and independent preference resolution.                                               |
| `src/app/mobile-web/formatting.ts`                      | Long/Short and Bullets/Paragraphs controls, defaults, persistence, and generate-field serialization.                                                                                    |
| `src/utils/mobileOutputLanguages.ts`                    | Deliberate API-repo shared 18-language labels, codes, country flags, order, and `cs` to `cz` normalization matching extension source.                                                   |
| `src/app/mobile-web/imagePreparation.ts`                | Isolated file preparation based on current 1280/.8 behavior, preview URLs, orientation capability, and typed HEIC recovery.                                                             |
| `src/app/mobile-web/uploadClient.ts`                    | V2 open, prepare, three-worker one-file uploads, ignored completion body behavior, post-completion signed-URL fetch, abort, and cleanup.                                                |
| `src/app/mobile-web/generationClient.ts`                | One-call mobile generation payload, request UUID, idempotency headers, response parser, safe error categories, and usage refresh trigger.                                               |
| `src/app/mobile-web/billing.ts`                         | Bearer checkout and portal calls, bounded return state, and post-return usage refresh.                                                                                                  |
| `src/app/mobile-web/analytics.ts`                       | First-touch bridge and bounded mobile-web event payloads.                                                                                                                               |
| `src/app/mobile-web/app.ts`                             | Created in Task 4. Authenticated state machine, DOM event wiring, progress, result editing, copy feedback, Vinted action, cleanup, and route handling.                                  |
| `src/components/mobile-web/WorkspaceShell.astro`        | Shared semantic workspace markup for `/app` and the later approved public sample mode.                                                                                                  |
| `src/components/mobile-web/PhotoRail.astro`             | Ordered photo previews and accessible add, replace, remove, and capture controls.                                                                                                       |
| `src/components/mobile-web/ListingControls.astro`       | Independent language and formatting controls with data attributes for the client.                                                                                                       |
| `src/components/mobile-web/ListingResult.astro`         | Editable title and description fields, copy buttons, safety note, and safe Vinted action.                                                                                               |
| `src/styles/mobile-web-app.css`                         | Prototype-faithful responsive layout, 44 px touch targets, focus states, skeletons, errors, and quota surfaces using existing tokens.                                                   |
| `utils/vintedRedirect.ts`                               | Additive safe country/domain mapping helper used by the web client without changing extension callers.                                                                                  |
| `src/app/mobile-web/__tests__/auth.test.ts`             | Supabase OAuth, email, OTP, callback cleanup, session refresh, and token redaction.                                                                                                     |
| `src/pages/__tests__/mobileWebRoute.test.ts`            | Private route source, noindex, no-schema, CSP, and extension callback boundary.                                                                                                         |
| `src/app/mobile-web/__tests__/config.test.ts`           | Exact flag and build-time Supabase configuration validation without secret output.                                                                                                      |
| `src/app/mobile-web/__tests__/language.test.ts`         | Shared script adapter, exact 18-language order, labels, flags, browser fallback, and persistence.                                                                                       |
| `src/app/mobile-web/__tests__/uploadClient.test.ts`     | Preparation, V2 URLs, ignored completion body, ordered signed URL mapping, concurrency, abort, expiry, and cleanup.                                                                     |
| `src/app/mobile-web/__tests__/generationClient.test.ts` | Payload, one-call response, 401, 403, 429, 400, 413, 415, 5xx, 504, and same-key idempotency behavior.                                                                                  |
| `src/app/mobile-web/__tests__/billingAnalytics.test.ts` | Bearer checkout, usage refresh, attribution propagation, event redaction, clipboard fallback, and safe Vinted mapping.                                                                  |
| `src/app/mobile-web/__tests__/releaseContract.test.ts`  | Static build contract for private routes, flag-disabled behavior, out-of-scope exclusions, and shared component selectors.                                                              |

## Dependencies and execution order

Backend foundation Tasks 1 through 5 are prerequisites for the corresponding client work. Client Task 1 consumes backend Tasks 1 through 3, Task 3 consumes backend Tasks 1 and 2, Task 4 consumes backend Tasks 1, 2, and 4, and Task 5 consumes backend Tasks 1, 2, and 5. Client Task 6 consumes all client tasks and backend Task 6. The acquisition plan begins only after Client Task 6 preview and real-device gates pass. The acquisition plan may import shared presentation components in sample mode but must not call generation for visitors.

### Task 1: Private Astro shell, build config, and Supabase browser auth

**Prerequisites:** Backend Task 1 for the client context and origin contract, Backend Task 2 for the usage endpoint, and Backend Task 3 for the fixed web magic-link callback. No client functionality is considered available until those tasks are reviewed.

**Files:**

- Create: `src/pages/app/index.astro`
- Create: `src/pages/app/auth/callback.astro`
- Create: `src/app/mobile-web/config.ts`
- Create: `src/app/mobile-web/types.ts`
- Create: `src/app/mobile-web/auth.ts`
- Create: `src/app/mobile-web/api.ts`
- Create: `src/app/mobile-web/__tests__/config.test.ts`
- Create: `src/app/mobile-web/__tests__/auth.test.ts`
- Create: `src/pages/__tests__/mobileWebRoute.test.ts`

**Interfaces:**

- Produces `getMobileWebBuildConfig(env: Record<string, string | undefined>)`, `createBrowserSupabaseClient()`, `signInWithGoogle()`, `requestMagicLink(email)`, `verifyEmailOtp(email, token)`, `completeWebCallback(url)`, `getBrowserSession()`, `refreshBrowserSession()`, `signOutBrowser()`, and `fetchMobileJson(path, init, options?: { retryOn401?: boolean })`.
- `getMobileWebBuildConfig` returns `{ enabled, supabaseUrl, supabaseAnonKey }`. It requires exact string `"true"` for the public flag. When enabled it rejects missing, non-HTTPS, credential-bearing, or non-root Supabase URLs and an empty anon key. Tests assert only booleans and non-secret error codes, never values.
- `fetchMobileJson` returns parsed JSON or throws `MobileApiError { status: number; code: string; message: string; retryable: boolean }`. It refreshes once after a 401 and repeats the original request only when permitted. Generation supplies its own same request ID.
- Consumes backend Tasks 1 through 3. It never imports `public/auth-callback.js` or calls `/auth/callback`.

- [ ] **Step 1: Write failing configuration, auth, route, and callback tests.**

```ts
it("auth_callback_cleans_url_and_uses_web_session", async () => {
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
  expect(refreshBrowserSession).not.toHaveBeenCalled();
});

it("validates_enabled_build_config_without_printing_secrets", () => {
  expect(() =>
    getMobileWebBuildConfig({
      PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
      PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
  ).not.toThrow();
  expect(() =>
    getMobileWebBuildConfig({
      PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
      PUBLIC_SUPABASE_URL: "http://project.supabase.co",
      PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
  ).toThrow("invalid_supabase_url");
});
```

- [ ] **Step 2: Run tests to verify RED.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/config.test.ts src/app/mobile-web/__tests__/auth.test.ts src/pages/__tests__/mobileWebRoute.test.ts`

Expected: FAIL because the private routes, web callback, config validator, and browser modules do not exist.

- [ ] **Step 3: Implement the private documents, config, auth, and API wrapper.**

Create Supabase with `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true` using the validated public values. Google uses `${location.origin}/app/auth/callback`; the email request sends `{ email, client: "mobile_web" }`; OTP calls `verifyOtp({ email, token, type: "email" })`. The callback exchanges a PKCE code or accepts the configured hash session form, replaces the URL with `/app`, and returns the session without logging tokens. The route documents include noindex and a CSP with exact `connect-src 'self'`, the configured Supabase origin, `https://api.stripe.com`, `https://www.google-analytics.com`, and `https://www.googletagmanager.com`; `img-src` is only `'self' data: blob:`. When the flag is false, the route renders a disabled notice and does not load auth or app modules.

- [ ] **Step 4: Run GREEN tests and the static build.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/config.test.ts src/app/mobile-web/__tests__/auth.test.ts src/pages/__tests__/mobileWebRoute.test.ts && pnpm run build`

Expected: PASS. The build emits both private documents with noindex, exact CSP, no JSON-LD, and no extension callback import. Disabled and enabled configuration paths are covered without secret output.

- [ ] **Step 5: Commit the private shell.**

```bash
git add src/pages/app src/app/mobile-web/config.ts src/app/mobile-web/types.ts src/app/mobile-web/auth.ts src/app/mobile-web/api.ts src/app/mobile-web/__tests__/config.test.ts src/app/mobile-web/__tests__/auth.test.ts src/pages/__tests__/mobileWebRoute.test.ts
git commit -m "feat: add authenticated mobile app shell"
```

### Task 2: Exact language adapter and formatting controls

**Prerequisites:** Client Task 1 and Backend Tasks 1 through 3. The language adapter must not be wired to a missing backend or an extension callback.

**Files:**

- Create: `src/utils/mobileOutputLanguages.ts`
- Create: `src/app/mobile-web/language.ts`
- Create: `src/app/mobile-web/formatting.ts`
- Create: `src/components/mobile-web/ListingControls.astro`
- Create: `src/app/mobile-web/__tests__/language.test.ts`

**Interfaces:**

- `BrowserStorageAdapter` is `{ getItem(key: string): string | null; setItem(key: string, value: string): void }`.
- `LanguageResolutionInput` is `{ storage: BrowserStorageAdapter; hostname: string; navigatorLanguages?: readonly string[]; navigatorLanguage?: string }`. `resolveMobileLanguagePreferences(input)` returns `{ languageCode: string; titleLanguageCode: string; descriptionLanguageCode: string }` and persists the three semantic keys independently.
- `SUPPORTED_OUTPUT_LANGUAGES` contains `{ code, label, shortLabel, flagCountryCode }` in exact extension order: `en, fr, cz, da, nl, de, el, hr, fi, hu, it, lt, pl, pt, ro, es, sk, sv`. `cs` normalizes to `cz`.
- `/ui-components/language-defaults.js` is loaded once and supplies default resolution only. It does not provide the 18 labels or flags. The deliberate API-repo list matches `quick-vint/content.js`, including `English`, `Français`, `Čeština`, `Dansk`, `Nederlands`, `Deutsch`, `Ελληνικά`, `Hrvatski`, `Suomeksi`, `Magyar`, `Italiano`, `Lietuvių`, `Polski`, `Português`, `Română`, `Español`, `Slovenčina`, and `Svenska`, with extension flag country codes `gb, fr, cz, dk, nl, de, gr, hr, fi, hu, it, lt, pl, pt, ro, es, sk, se`.
- `readFormattingPreferences(storage)` defaults to `{ descriptionLength: "long", useBulletPoints: true }`; serialization sends `descriptionLength` and `useBulletPoints` exactly.

- [ ] **Step 1: Write failing language and formatting tests.**

```ts
it("language_defaults_use_shared_script_and_persist_independently", () => {
  const storage = memoryStorage({
    selectedTitleLanguage: "fr",
    selectedDescriptionLanguage: "it",
  });
  const result = resolveMobileLanguagePreferences({
    storage,
    hostname: "",
    navigatorLanguages: ["de-DE"],
    navigatorLanguage: "de-DE",
  });
  expect(result.titleLanguageCode).toBe("fr");
  expect(result.descriptionLanguageCode).toBe("it");
  expect(sharedDefaultsResolve).toHaveBeenCalledWith(
    storage,
    expect.objectContaining({ hostname: "", navigatorLanguages: ["de-DE"] }),
  );
  expect(SUPPORTED_OUTPUT_LANGUAGES.map((item) => item.code)).toEqual([
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
});

it("uses Long and Bullets defaults and serializes exact generation fields", () => {
  expect(readFormattingPreferences(memoryStorage())).toEqual({
    descriptionLength: "long",
    useBulletPoints: true,
  });
  expect(
    serializeFormattingPreferences({
      descriptionLength: "short",
      useBulletPoints: false,
    }),
  ).toEqual({
    descriptionLength: "short",
    useBulletPoints: false,
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/language.test.ts`

Expected: FAIL because the API-repo language list, shared-script adapter, and formatting serializer do not exist.

- [ ] **Step 3: Implement the exact list, adapter, and controls.**

Call the existing defaults global with the supplied hostname and navigator values, using an empty hostname for the app. Resolve browser fallback when no Vinted hostname exists, then apply independently persisted title and description values. Render two distinct language controls and Long/Short plus Bullets/Paragraphs controls. Never claim the shared script exports labels or flags.

- [ ] **Step 4: Run GREEN tests and type-check.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/language.test.ts && pnpm run type-check`

Expected: PASS. Tests prove exact order, labels, flags, browser fallback, independent keys, `cs` normalization, and Long/Bullets defaults.

- [ ] **Step 5: Commit controls.**

```bash
git add src/utils/mobileOutputLanguages.ts src/app/mobile-web/language.ts src/app/mobile-web/formatting.ts src/components/mobile-web/ListingControls.astro src/app/mobile-web/__tests__/language.test.ts
git commit -m "feat: add mobile language and format controls"
```

### Task 3: Isolated image preparation and ordered V2 upload

**Prerequisites:** Client Task 1 and Backend Tasks 1 and 2. The queue consumes the bearer API wrapper and must not change `api/phone-upload.ts`.

**Files:**

- Create: `src/app/mobile-web/imagePreparation.ts`
- Create: `src/app/mobile-web/uploadClient.ts`
- Create: `src/app/mobile-web/__tests__/uploadClient.test.ts`
- Create: `src/components/mobile-web/PhotoRail.astro`

**Interfaces:**

- `prepareMobileImage(file)` returns `{ file: File; previewUrl: string; sourceType: string; recoveredOrientation: boolean }` or a typed `unsupported-heic` or `decode-failed` error. It is a deliberate isolated helper, not an extraction claim about the current inline phone-upload code.
- `openSingleUpload(sessionId, accessToken)` calls `POST /api/phone-upload?action=open&v=2&mode=single&sessionId=<uuid>` with bearer auth. `prepareUpload` calls `POST /api/phone-upload?action=prepare&sessionId=<uuid>&expectedCount=<n>&v=2&uploaderId=<uuid>`.
- Each multipart upload calls `POST /api/phone-upload?v=2&sessionId=<uuid>&expectedCount=<n>` with one file, `sessionId`, `uploadOrder`, and `file`. Completion calls `POST /api/phone-upload?action=complete&sessionId=<uuid>&expectedCount=<n>&v=2`; its body `orders` is ignored by the server and cannot be treated as signed URLs.
- After completion, call `GET /api/phone-upload?v=2&includeUrls=1&sessionId=<uuid>` and map `files[].url` by `files[].order` to the selected-file order. `cleanupUploadSession(sessionId, phase)` calls cancellation with `POST?action=cleanup&v=2&reason=cancelled&sessionId=<uuid>` and body `{}` for abort, expiry, route change, or terminal upload error. Post-generation cleanup calls `POST?action=cleanup&v=2&sessionId=<uuid>` only after generation no longer needs signed URLs.
- `uploadSelectedPhotos` uses a separate three-worker queue. Existing phone-upload concurrency remains two and is covered by regression tests.

- [ ] **Step 1: Write failing preparation, order, concurrency, signed-URL, and cleanup tests.**

```ts
it("upload_preserves_order_and_cleans_up_after_abort", async () => {
  const controller = new AbortController();
  const pending = uploadSelectedPhotos(
    session,
    selectedFiles(6),
    controller.signal,
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "aborted" });
  expect(maxConcurrentMultipartRequests()).toBeLessThanOrEqual(3);
  expect(cleanupFetch).toHaveBeenCalledWith(
    expect.stringContaining("action=cleanup&v=2&reason=cancelled"),
    expect.objectContaining({ body: "{}" }),
  );
});

it("maps completion manifest URLs only after includeUrls fetch", async () => {
  const result = await uploadSelectedPhotos(
    session,
    selectedFiles(4),
    new AbortController().signal,
  );
  expect(completeRequest.body).toEqual({ orders: [0, 1, 2, 3] });
  expect(result.map((item) => item.url)).toEqual([
    "signed-0",
    "signed-1",
    "signed-2",
    "signed-3",
  ]);
  expect(fetchLog.at(-1)?.url).toContain("v=2&includeUrls=1");
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/uploadClient.test.ts`

Expected: FAIL because the isolated preparation helper, V2 client, and photo rail do not exist.

- [ ] **Step 3: Implement preparation with explicit current-behavior boundaries.**

Use `createImageBitmap` and an `Image` fallback, constrain the longest dimension to 1280, encode JPEG at quality 0.8, and create one preview URL per selected file. Standard image input assumes orientation 1 because the current path does; a DNG-aware path may expose orientation. When HEIC/HEIF decode fails, retain the original selection and expose a typed replacement or recovery action rather than silently claiming conversion. Revoke preview URLs on replacement, removal, cancellation, route change, unmount, and after generation cleanup.

- [ ] **Step 4: Implement exact V2 sequencing and three-worker queue.**

Generate session and uploader UUIDs, open `mode=single`, prepare the exact selected count, prepare before multipart upload, and schedule no more than three active requests. Use original order for `uploadOrder`; retry only safe transport or retry statuses that do not indicate session expiry. Complete with the order array, fetch signed URLs in a separate `includeUrls=1` GET, and retain those URLs until generation finishes. Never cleanup immediately after completion. On cancellation use `reason=cancelled`; on post-generation cleanup use the ordinary V2 cleanup path. Do not introduce a photo-count cap or persist files.

- [ ] **Step 5: Run upload tests, current phone-upload regressions, and type-check.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/uploadClient.test.ts src/api/__tests__/phoneUpload.test.ts src/pages/__tests__/phoneUploadHtml.test.ts && pnpm run type-check`

Expected: PASS. New tests prove preparation, order, concurrency three, completion-body semantics, signed-URL mapping, abort cleanup, HEIC recovery, and post-generation cleanup. Existing phone-upload tests prove the QR flow remains unchanged.

- [ ] **Step 6: Commit the upload client.**

```bash
git add src/app/mobile-web/imagePreparation.ts src/app/mobile-web/uploadClient.ts src/components/mobile-web/PhotoRail.astro src/app/mobile-web/__tests__/uploadClient.test.ts
git commit -m "feat: add ordered mobile photo upload client"
```

### Task 4: Generation, usage, and recovery state machine

**Prerequisites:** Client Tasks 1 through 3 and Backend Tasks 1, 2, and 4. The route must not claim generation functionality until the backend idempotency and verified commit interfaces exist.

**Files:**

- Create: `src/app/mobile-web/generationClient.ts`
- Create: `src/app/mobile-web/__tests__/generationClient.test.ts`
- Create: `src/components/mobile-web/WorkspaceShell.astro`
- Create: `src/app/mobile-web/app.ts`

**Interfaces:**

- Produces `loadUsage()`, `generateListing(input)`, and `MobileGenerationState` with `idle`, `uploading`, `generating`, `success`, `quota`, and `error` states.
- `generateListing` sends one JSON request to `/api/generate` with ordered `imageUrls`, `titleLanguageCode`, `descriptionLanguageCode`, `descriptionLength`, `useBulletPoints`, `generationMode: "manual"`, `X-Autolister-Client: mobile_web`, and a UUID `X-Autolister-Request-Id`. It returns `{ title, description, measurementAdvice?, offers? }` from the backend one-call response.
- `app.ts` is created here as the owner of the authenticated state machine. It consumes usage, language, formatting, and upload results and calls post-generation cleanup only after generation has settled.

- [ ] **Step 1: Write failing payload, status, retry, and state tests.**

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

it("generation_retries_auth_once_but_not_unknown_writes", async () => {
  fetchMock.mockResolvedValueOnce(new Response("", { status: 504 }));
  await expect(generateListing(input)).rejects.toMatchObject({
    status: 504,
    retryable: true,
  });
  const requestIds = requestHeadersFromAllCalls().map((headers) =>
    headers.get("X-Autolister-Request-Id"),
  );
  expect(new Set(requestIds).size).toBe(1);
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/generationClient.test.ts`

Expected: FAIL because the generation client, workspace shell, and `app.ts` do not exist.

- [ ] **Step 3: Implement exact generation and usage handling.**

Use the backend mobile request fields and existing accepted defaults for tone, emoji, hashtag, and footer. Never split title and description into separate calls. Disable the action while a request is active. Refresh usage after auth, success, 403, 429, and checkout return. Map 400 to retained settings and photos, 413 to per-photo compression or replacement, 415 to typed unsupported-photo recovery, and 5xx or 504 to a retained same-key retry. A 401 refreshes once through `fetchMobileJson`. Escape generated text before DOM insertion and never render a fake success state.

- [ ] **Step 4: Implement `app.ts` state and terminal cleanup.**

Wire auth, usage, controls, photo rail, upload, generation, and result selectors. Keep signed URLs until generation settles, then call ordinary post-generation V2 cleanup and revoke previews. On cancellation, route change, unmount, sign-out, or fatal upload error, abort active work, revoke previews, and call cancellation cleanup. Preserve files and settings on recoverable 400, 413, 415, 403, 429, 5xx, and 504 states.

- [ ] **Step 5: Run focused generation tests and type-check.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/generationClient.test.ts src/app/mobile-web/__tests__/auth.test.ts && pnpm run type-check`

Expected: PASS. Tests cover one request, independent fields, server status truth, one auth refresh, same-key unknown-write handling, usage refresh, and retained photos/settings.

- [ ] **Step 6: Commit the generation state machine.**

```bash
git add src/app/mobile-web/generationClient.ts src/app/mobile-web/app.ts src/components/mobile-web/WorkspaceShell.astro src/app/mobile-web/__tests__/generationClient.test.ts
git commit -m "feat: add mobile generation state machine"
```

### Task 5: Editable result, safe Vinted action, billing, and analytics

**Prerequisites:** Client Task 4 and Backend Tasks 1, 2, and 5. Backend billing must expose bearer ownership before these controls are enabled.

**Files:**

- Create: `src/app/mobile-web/billing.ts`
- Create: `src/app/mobile-web/analytics.ts`
- Create: `src/app/mobile-web/__tests__/billingAnalytics.test.ts`
- Create: `src/components/mobile-web/ListingResult.astro`
- Modify: `src/app/mobile-web/app.ts: result, billing, and analytics event wiring`
- Modify: `utils/vintedRedirect.ts: additive safe host/country helper and regression tests`

**Interfaces:**

- Produces `copyListingField(field, text)`, `getSafeVintedCreateListingUrl(countryCode)`, `startMobileCheckout(tier)`, `openMobilePortal()`, `refreshAfterCheckout()`, `trackMobileEvent(event, context)`, and `claimFirstTouchAfterAuth(session)`.
- `getSafeVintedCreateListingUrl` extends the current `VINTED_DOMAINS` country mapping and rejects unknown country codes or hosts. It returns only an `https://www.<approved-domain>/items/new` URL and does not inspect or invent an arbitrary browser hostname.
- Consumes backend bearer checkout and portal routes, `/api/user/usage`, `/api/events/track`, `/api/attribution/claim`, and existing first-touch state. The current analytics transport does not decorate `/app` or define `web_app_click`; this task adds a bounded mobile layer rather than claiming reuse.

- [ ] **Step 1: Write failing result, URL, billing, attribution, and redaction tests.**

```ts
it("billing_copy_vinted_and_events_redact_sensitive_values", async () => {
  await copyListingField("title", "Blue dress");
  expect(clipboardWriteText).toHaveBeenCalledWith("Blue dress");
  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      body: expect.stringContaining("Blue dress"),
    }),
  );
  expect(getSafeVintedCreateListingUrl("fr")).toBe(
    "https://www.vinted.fr/items/new",
  );
  expect(() => getSafeVintedCreateListingUrl("evil")).toThrow(
    "unsupported_country",
  );
  await startMobileCheckout("starter");
  expect(fetchMock.mock.calls.at(-1)?.[1].body).not.toContain("accessToken");
  await trackMobileEvent("generation_success", {
    imageCount: 2,
    description: "private",
  });
  expect(fetchMock.mock.calls.at(-1)?.[1].body).not.toContain("private");
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/billingAnalytics.test.ts`

Expected: FAIL because result, safe Vinted, billing, attribution, and mobile analytics modules do not exist.

- [ ] **Step 3: Implement result editing and clipboard fallback.**

Render title and description as local editable fields, keep the safety note outside both values, copy only the selected field with `navigator.clipboard.writeText`, and use a temporary hidden textarea plus `document.execCommand("copy")` when Clipboard API is unavailable. Emit only field name and result status. Escape generated text before insertion.

- [ ] **Step 4: Implement safe Vinted mapping and bearer billing.**

Import the existing country mapping and add an allowlisted helper in `utils/vintedRedirect.ts` without changing extension callers. Navigate normally to the HTTPS create URL. Post only `{ tier, source: "mobile_web", utm }` with bearer auth to checkout, use the portal branch for paid users, return to `/app`, and refresh usage with bounded backoff after webhook propagation. No client email, user ID, customer ID, or arbitrary return URL is accepted.

- [ ] **Step 5: Implement first-touch preservation and bounded mobile analytics.**

Reuse sanitized first-touch state under `autolister.first_touch.v1`, preserve approved `ref` and UTM values through `/app` and checkout, call attribution claim after auth best effort, and send only `source: "mobile_web"` with `web_app_click`, `auth_complete`, `upload_complete`, `generation_success`, `generation_error`, `copy`, `vinted_click`, `checkout_start`, and `checkout_return`. Strip tokens, emails, image URLs, filenames, generated text, and arbitrary query keys before serialization.

- [ ] **Step 6: Run focused tests and type-check.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/billingAnalytics.test.ts src/api/__tests__/eventsTrack.test.ts src/api/__tests__/attributionClaim.test.ts && pnpm run type-check`

Expected: PASS. Existing event and attribution contracts remain green, and new tests prove safe copy, allowlisted Vinted URL mapping, bearer billing, first-touch preservation, event context allowlisting, and redaction.

- [ ] **Step 7: Commit the result and monetization surface.**

```bash
git add src/app/mobile-web/billing.ts src/app/mobile-web/analytics.ts src/app/mobile-web/app.ts src/components/mobile-web/ListingResult.astro utils/vintedRedirect.ts src/app/mobile-web/__tests__/billingAnalytics.test.ts
git commit -m "feat: add mobile result billing and analytics"
```

### Task 6: Prototype-faithful shell, release contracts, and device gates

**Prerequisites:** Client Tasks 1 through 5 and Backend Tasks 1 through 6. The public acquisition plan cannot publish a CTA or sample before this task's preview and device gates pass.

**Files:**

- Create: `src/styles/mobile-web-app.css`
- Create: `src/app/mobile-web/__tests__/releaseContract.test.ts`
- Modify: `src/components/mobile-web/WorkspaceShell.astro: final shell markup and sample mode contract`
- Modify: `src/components/mobile-web/PhotoRail.astro: final ordered controls and touch states`
- Modify: `src/pages/app/index.astro: final shell and stylesheet mount`
- Modify: `src/app/mobile-web/app.ts: DOM event wiring and terminal cleanup`

**Interfaces:**

- `WorkspaceShell` accepts `mode: "interactive" | "sample"`. Sample mode accepts reviewed `photo`, `title`, `description`, and `disclosure` props and never mounts auth, upload, generation, billing, or analytics transport. No prototype-local fake asset or localStorage key is imported.
- Stable `data-mobile-web-*` selectors expose the photo rail, controls, generation canvas, result, quota card, auth card, disabled state, and checkout return state.
- `PUBLIC_MOBILE_WEB_APP_ENABLED` false produces an honest disabled state in `/app` and prevents client module loading. It is not a hidden fallback to anonymous generation. The release owner enables it only after the gates below.

- [ ] **Step 1: Write failing shell, flag, private-route, and scope tests.**

```ts
it("exposes the approved app surfaces and excludes unsupported features", () => {
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

it("private_route_contract_has_noindex_and_no_public_schema", () => {
  for (const path of [
    "src/pages/app/index.astro",
    "src/pages/app/auth/callback.astro",
  ]) {
    const html = readFileSync(path, "utf8");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain("application/ld+json");
    expect(html).toContain("PUBLIC_MOBILE_WEB_APP_ENABLED");
    expect(html).toContain("connect-src 'self'");
    expect(html).toContain("img-src 'self' data: blob:");
  }
});
```

- [ ] **Step 2: Run the release test to verify RED.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/releaseContract.test.ts`

Expected: FAIL because the shared shell, stable selectors, disabled flag state, and responsive CSS do not exist.

- [ ] **Step 3: Implement the responsive shell and CSS.**

Use existing Inter and brand tokens, one filled primary per state, 44 px touch targets, safe-area padding, keyboard-visible focus, bottom-sheet controls on narrow screens, a two-column result workspace on wide screens, honest skeleton and error states, and a sticky Vinted action only after success. Add reduced-motion behavior. Keep prototype copy and hierarchy without importing fake sample assets or a new framework.

- [ ] **Step 4: Wire state and terminal resource cleanup.**

Mount auth, usage, controls, photos, upload, generation, result, copy, billing, and analytics handlers. On sign-out, route change, unmount, abort, and fatal error, abort active work, revoke object URLs, clear file references, and call the correct V2 cleanup. On generation completion, perform post-generation cleanup only after the response is parsed. Preserve files and settings on recoverable 400, 413, 415, 403, 429, 5xx, and 504 states.

- [ ] **Step 5: Run deterministic contracts, build, and the repository verification command.**

Run: `pnpm exec vitest run src/app/mobile-web/__tests__/releaseContract.test.ts src/app/mobile-web/__tests__/config.test.ts src/app/mobile-web/__tests__/auth.test.ts src/app/mobile-web/__tests__/language.test.ts src/app/mobile-web/__tests__/uploadClient.test.ts src/app/mobile-web/__tests__/generationClient.test.ts src/app/mobile-web/__tests__/billingAnalytics.test.ts && pnpm run verify:production`

Expected: PASS. The build emits private documents, no service worker or browser persistence layer appears, and the current extension/site suite remains green.

- [ ] **Step 6: Run preview and real-device gates without deployment.**

Run: `pnpm run build && pnpm run preview -- --host 0.0.0.0`

Expected: Preview serves `/app` and its callback with no public schema. The release owner manually checks Google OAuth, one email link plus OTP, refresh, HEIC, orientation, large compressed photos, cancellation, copy fallback, quota refresh, checkout return, and Vinted HTTPS navigation on iPhone Safari and Android Chrome. Native Vinted app opening is not marked verified. Do not enable the public CTA or run a production deployment from this task.

- [ ] **Step 7: Commit the client launch surface.**

```bash
git add src/pages/app src/components/mobile-web src/styles/mobile-web-app.css src/app/mobile-web/app.ts src/app/mobile-web/__tests__/releaseContract.test.ts
git commit -m "feat: finish mobile web app client shell"
```

## Handoff and release boundary

The acquisition SEO plan may consume `WorkspaceShell.astro`, `PhotoRail.astro`, `ListingControls.astro`, `ListingResult.astro`, and `mobile-web-app.css` only after Task 6 preview and real-device gates pass. It must use an approved static sample and never call `/api/generate` for visitors. This plan omits seller-note sync, history, batch, offline, service worker, IndexedDB, share target, native handoff, and anonymous generation. No public CTA or sitemap entry is enabled by this plan.
