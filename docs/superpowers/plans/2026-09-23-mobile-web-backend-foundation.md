# Mobile Web Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the authenticated `mobile_web` server contracts required by `/app` while preserving every existing extension, callback, quota, Stripe, upload, and Orion contract.

**Architecture:** A focused client-context and origin layer identifies mobile web requests without pretending to be an extension. A read-only usage service and bearer-owned billing branches reuse the current tier, limiter, profile, and Stripe helpers. Generation idempotency is an additive security-definer RPC and table with atomic claim transitions, bounded response storage, and explicit reservation commit verification. Existing extension branches keep their current inputs and refund behavior.

**Tech Stack:** Node 20+, TypeScript 5.8, Vercel handlers, Astro static deployment, Supabase service-role client and RPCs, Stripe 18, PostgreSQL migrations, Resend, and Vitest 4 through pnpm.

**Spec:** `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`

## Global Constraints

- `X-Autolister-Client: mobile_web` is opt-in and the extension version header is never spoofed.
- Existing extension request and response contracts, `/auth/callback`, `chrome.storage`, Orion runtime behavior, phone-upload QR CORS, and extension checkout remain unchanged.
- `GET /api/user/usage` is bearer-authenticated, read-only, `Cache-Control: private, no-store`, and is the only browser quota and subscription summary contract.
- Quota decisions continue to use `utils/rateLimiter.ts` and `utils/tierConfig.ts`; no second quota ledger or client database read is introduced.
- `/api/generate` keeps one structured model call returning both `title` and `description`, with the existing parser, prompt branches, reservation, commit, and refund behavior.
- The free plan remains five lifetime generations. Paid monthly prices come from `TIER_CONFIGS[*].monthlyPrice`, and the existing credit pack comes from `CREDIT_PACK_CONFIG.priceEur`.
- Mobile idempotency stores only a normalized request hash, bounded response, status, reservation reference, failure metadata, and expiry. It never stores raw photos, base64 data, signed URL values, generated logs, or access tokens.
- The web server flag is exact: `MOBILE_WEB_APP_ENABLED === "true"` enables new mobile API branches; any other value disables them. Existing extension branches ignore this flag.
- Only `https://autolister.app`, `https://www.autolister.app`, configured preview origins, and already-approved Vinted origins are allowed where an endpoint requires them. Credentialed wildcard CORS is forbidden.
- The usage endpoint has its own GET-capable CORS helper. `checkoutCors` remains POST and OPTIONS only. Phone-upload CORS is not tightened in this phase because the existing QR flow depends on its current behavior; the same-origin app adds no new cross-origin phone-upload reliance.
- Mobile checkout and portal ownership come from the bearer user. Client email, user IDs, arbitrary return URLs, and arbitrary Stripe customer IDs are ignored in the web branch.
- Web auth accepts only the allowlisted `/app/auth/callback` redirect. An arbitrary redirect URL is never accepted from the request body.
- Stripe webhook entitlement and usage-period reset logic remains authoritative and is not duplicated in checkout responses.
- Supabase migrations use the authorized release procedure after review. No implementation task runs a migration, deploys production, mutates Stripe live data, changes redirect configuration, or edits production environment values.
- Use pnpm because `packageManager` and `pnpm-lock.yaml` are authoritative. Run commands from `/home/mests/projects/quick-vint-api`.
- Preserve all unrelated dirty files and stage only files owned by the current task.

## Review Focus

1. A repeated mobile request must not reserve twice, and an expired retry must be atomic. Pin this to `claim_is_atomic_and_replays_bounded_failure` in Task 4.
2. A client email or user ID must not own a web checkout or portal session, and an active subscriber must return to `/app`. Pin this to `bearer_owns_mobile_checkout_and_portal_return` in Task 5.
3. A request without `mobile_web` must retain current extension pricing mode, CORS, phone-upload QR behavior, and refund behavior. Pin this to `extension_request_contracts_remain_unchanged` in Tasks 1 and 4.
4. Free, paid, paused, inactive, payment-required, and missing-profile states must produce server-authoritative limits and UTC reset boundaries without initializing or leaking profile rows. Pin this to `usage_projection_handles_capacity_and_boundaries` in Task 2.
5. Web auth must select only the app callback while extension auth remains unchanged, and OTP coverage must execute in the focused test command. Pin this to `mobile_callback_and_existing_otp_email` in Task 3.

---

## File structure map

| File                                                          | Responsibility                                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/allowedOrigins.ts`                                     | Shared, testable app and Vinted origin allowlists. It reads configured preview origins per call and never returns a wildcard credentialed origin.    |
| `utils/mobileWeb.ts`                                          | `mobile_web` context parsing, exact server feature flag, callback and return URL allowlists, pricing-mode selection, and UUID request ID validation. |
| `utils/usageCors.ts`                                          | GET and OPTIONS CORS middleware for `/api/user/usage`, with Authorization and mobile context headers.                                                |
| `utils/userUsage.ts`                                          | Profile projection, tier pricing, account status, minute fallback, and explicit UTC minute, day, and month reset boundaries.                         |
| `api/user/usage.ts`                                           | Bearer-authenticated GET endpoint, missing-profile 404, private cache headers, usage CORS, and generic failures. It never upserts a profile.         |
| `utils/mobileGenerationTypes.ts`                              | Exact mobile request and response types shared by generate integration and idempotency.                                                              |
| `utils/mobileGenerationIdempotency.ts`                        | Canonical request hash, RPC result decoding, bounded response validation, and typed claim, success, failure, and pending-commit transitions.         |
| `migrations/2026-09-23_mobile_web_generation_idempotency.sql` | Public-schema table, indexes, RLS, grants, security-definer atomic RPCs, status checks, byte bound, and expiry cleanup support.                      |
| `utils/rateLimiter.ts`                                        | Additive minute-remaining read and verified reservation commit result. Existing void commit API remains for extension callers.                       |
| `api/generate.ts`                                             | Additive mobile context, idempotency integration, verified commit path, and mobile-only failure state. Existing extension path stays intact.         |
| `api/auth/magic-link.ts`                                      | Validated `client: "mobile_web"` callback branch while preserving the extension default and branded link plus OTP email.                             |
| `utils/mobileCheckout.ts`                                     | Bearer profile ownership, selected Stripe fields, bounded checkout return URL, and explicit portal return URL helper.                                |
| `api/stripe/create-checkout.ts`                               | Mobile branch before `resolveCheckoutEmail`, mobile customer/session metadata, and `/app` active-subscriber portal return.                           |
| `api/stripe/create-portal.ts`                                 | Mobile branch before email lookup, bearer-owned profile fields, and `/app` portal return.                                                            |
| `utils/checkoutCors.ts`                                       | Existing POST and OPTIONS checkout CORS plus Authorization and mobile context headers.                                                               |
| `api/cron/daily-cleanup.ts`                                   | Additive expired mobile idempotency deletion; existing temp-upload cleanup remains unchanged.                                                        |
| `vercel.json`                                                 | Exact app and callback `X-Robots-Tag` rules and no generic image wildcard CSP. Static app CSP is owned by the app plan.                              |
| `src/utils/__tests__/mobileWeb.test.ts`                       | Context, exact feature flag, callback, return URL, request ID, and origin allowlist tests.                                                           |
| `src/api/__tests__/mobileWebCors.test.ts`                     | Actual generate, usage, and checkout preflight header tests, plus phone-upload CORS regression.                                                      |
| `src/api/__tests__/userUsageEndpoint.test.ts`                 | Auth, profile selection, capacity fixtures, account states, reset boundaries, cache, and redaction tests.                                            |
| `src/api/__tests__/magicLinkEndpoint.test.ts`                 | Existing callback and OTP email tests plus mobile callback and redirect injection tests.                                                             |
| `src/utils/__tests__/mobileGenerationIdempotency.test.ts`     | Canonical hash, bounded response, status, expiry, and RPC decoding tests.                                                                            |
| `src/api/__tests__/generateMobileWeb.test.ts`                 | Claim ordering, duplicate prevention, commit verification, mobile failure replay, and extension regression tests.                                    |
| `src/api/__tests__/mobileCheckout.test.ts`                    | Bearer checkout and portal ownership, selected profile fields, metadata, return URLs, and extension compatibility.                                   |
| `src/api/__tests__/mobileWebConfig.test.ts`                   | Both app and callback header rules and exact flag behavior.                                                                                          |

## Dependencies and execution order

Implement Tasks 1 through 6 in order. Task 1 defines the client, origin, and flag contracts consumed by Tasks 2 through 5. Task 2 defines usage types and limiter additions. Task 3 is the callback branch. Task 4 consumes the request types and verified reservation helper. Task 5 consumes the mobile context and return URL helpers. Task 6 locks headers, cleanup, and regression coverage. The app-client plan depends on Tasks 1 through 5. The acquisition plan depends on the app-client route and components and owns sitemap behavior, not this backend plan.

### Task 1: Mobile context, origin policy, feature flag, and CORS contracts

**Files:**

- Create: `utils/allowedOrigins.ts`
- Create: `utils/mobileWeb.ts`
- Test: `src/utils/__tests__/mobileWeb.test.ts`
- Test: `src/api/__tests__/mobileWebCors.test.ts`
- Modify: `api/generate.ts: use shared app origin policy and add mobile headers`
- Modify: `utils/checkoutCors.ts: add Authorization and mobile context headers only`
- Create: `utils/usageCors.ts`

**Interfaces:**

- Produces `MOBILE_WEB_CLIENT = "mobile_web"`, `getMobileWebClient(value: unknown): "mobile_web" | null`, `getPricingLimitsModeForClient(args: { client?: unknown; extensionVersion?: string | null }): PricingLimitsMode`, `isMobileWebEnabled(env?: NodeJS.ProcessEnv): boolean`, `getMobileWebCallbackUrl(origin?: string): string`, `getMobileWebReturnUrl(value: unknown): string | null`, `isValidMobileRequestId(value: unknown): boolean`, `isAllowedAppOrigin(origin?: string): boolean`, and `isAllowedVintedOrigin(origin?: string): boolean`.
- `usageCors` exports `runUsageCors(req, res)` and `usageCorsOptions` with methods `GET, OPTIONS` and allowed headers `Authorization, Content-Type, X-Autolister-Client`.
- Consumes only current exports `getPricingLimitsMode` and `getPricingLimitsModeForExtension` from `utils/tierConfig.ts`. It does not modify tierConfig and does not use a nonexistent shared origin predicate.

- [ ] **Step 1: Write failing context, tier, allowlist, and actual preflight tests.**

```ts
it("preserves_extension_pricing_mode_for_non_mobile_requests", () => {
  expect(
    getPricingLimitsModeForClient({
      client: "mobile_web",
      extensionVersion: "1.2.0",
    }),
  ).toBe(getPricingLimitsMode());
  expect(getPricingLimitsModeForClient({ extensionVersion: "1.2.0" })).toBe(
    getPricingLimitsModeForExtension("1.2.0"),
  );
});

it("requires the exact server flag and approved origins", () => {
  expect(
    isMobileWebEnabled({ MOBILE_WEB_APP_ENABLED: "true" } as NodeJS.ProcessEnv),
  ).toBe(true);
  expect(isMobileWebEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  expect(isAllowedAppOrigin("https://autolister.app")).toBe(true);
  expect(isAllowedAppOrigin("https://evil.example")).toBe(false);
  expect(isAllowedVintedOrigin("https://www.vinted.fr")).toBe(true);
});

it("extension_request_contracts_remain_unchanged", async () => {
  const generateResponse = await invokeGenerateOptions(
    "https://autolister.app",
  );
  expect(generateResponse.headers["access-control-allow-headers"]).toContain(
    "X-Autolister-Client",
  );
  expect(generateResponse.headers["access-control-allow-headers"]).toContain(
    "X-Autolister-Request-Id",
  );
  const usageResponse = await invokeUsageOptions("https://autolister.app");
  expect(usageResponse.headers["access-control-allow-methods"]).toContain(
    "GET",
  );
  const checkoutResponse = await invokeCheckoutOptions(
    "https://autolister.app",
  );
  expect(checkoutResponse.headers["access-control-allow-methods"]).toContain(
    "POST",
  );
  expect(await invokePhoneUploadOptions("https://vinted.fr")).toMatchObject({
    statusCode: 200,
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail.**

Run: `pnpm exec vitest run src/utils/__tests__/mobileWeb.test.ts src/api/__tests__/mobileWebCors.test.ts`

Expected: FAIL because the mobile context, shared origin utility, usage CORS, and mobile headers do not exist.

- [ ] **Step 3: Implement the exact contracts without changing phone-upload CORS.**

Read `VERCEL_APP_ALLOWED_ORIGINS` inside the allowlist helper, always allow the two production app origins, preserve the current Vinted regex as a separate predicate, and reject other origins. `isMobileWebEnabled` returns true only for the exact string `"true"`. Mobile uses `getPricingLimitsMode()`; any request without the exact client value calls `getPricingLimitsModeForExtension` with the existing extension version. Add mobile headers to generate and checkout lists, but leave `api/phone-upload.ts`'s current `origin: true` middleware untouched. Same-origin `/app` fetches do not depend on a new cross-origin upload path.

- [ ] **Step 4: Run focused CORS, tier, and existing upload tests.**

Run: `pnpm exec vitest run src/utils/__tests__/mobileWeb.test.ts src/api/__tests__/mobileWebCors.test.ts src/api/__tests__/phoneUpload.test.ts`

Expected: PASS. The test proves current extension pricing selection, actual mobile request headers, GET usage CORS, POST checkout CORS, and unchanged phone-upload behavior.

- [ ] **Step 5: Commit the context and CORS contract.**

```bash
git add utils/allowedOrigins.ts utils/mobileWeb.ts utils/usageCors.ts api/generate.ts utils/checkoutCors.ts src/utils/__tests__/mobileWeb.test.ts src/api/__tests__/mobileWebCors.test.ts
git commit -m "feat: add mobile web server context and CORS contracts"
```

### Task 2: Authenticated usage projection and GET endpoint

**Prerequisites:** Backend Task 1.

**Files:**

- Create: `utils/userUsage.ts`
- Create: `api/user/usage.ts`
- Modify: `utils/rateLimiter.ts: public minute-remaining read`
- Test: `src/api/__tests__/userUsageEndpoint.test.ts`
- Modify: `utils/usageCors.ts: endpoint wiring if required by handler`

**Interfaces:**

- Produces `UsageProfile`, `UsageResponse`, `getUtcResetBoundary(now: Date, unit: "minute" | "day" | "month"): string`, `buildUsageResponse(profile, capacity, minuteRemaining, now): UsageResponse`, and `getUsageForBearer(token): Promise<UsageResponse>`.
- `UsageResponse` is exactly `{ plan: { tier: string; status: "free" | "active" | "paused" | "inactive" | "payment_required"; isPaid: boolean }; limits: { freeLifetime: number | null; daily: number | null; monthly: number | null; burstPerMinute: number | null; packCredits: number }; remaining: { freeLifetime: number | null; daily: number | null; monthly: number | null; minute: number | null; packCredits: number }; resetsAt: { minute: string | null; daily: string | null; monthly: string | null; subscriptionPeriodEnd: string | null }; canGenerate: boolean; pricing: { currency: "EUR"; tiers: Record<string, { monthly: number }>; creditPack: { credits: number; price: number } } }`. Values that do not apply are `null`, never guessed zero.
- `UsageProfile` explicitly includes `api_calls_this_month`, `subscription_status`, `subscription_tier`, `current_period_end`, `is_legacy_plan`, `free_lifetime_generations_used`, `pack_credits`, `custom_daily_limit`, `custom_monthly_limit`, `custom_limit_expires_at`, `account_status`, and `abuse_reason`.
- Adds `RateLimiter.getGenerationMinuteRemaining(userId: string, burstPerMinute: number): Promise<number | null>`. The usage service uses `capacity.remaining.minute` when present and calls this public method only when the limiter branch omitted it. A read failure produces `minute: null`, never a guessed zero.
- Consumes current `getEffectiveTier`, `getTierConfigForProfile`, `TIER_CONFIGS`, `getAllPaidTiers`, `CREDIT_PACK_CONFIG`, `isAccountPaused`, and `RateLimiter.getGenerationCapacity`. It uses the profile-aware tier accessor only and does not initialize a missing profile.

- [ ] **Step 1: Write failing tests with native capacity shapes and every account state.**

```ts
it("usage_projection_handles_capacity_and_boundaries", () => {
  const capacity: GenerationCapacity = {
    allowed: true,
    available: 5,
    tier: "free",
    limits: { daily: null, monthly: 8, freeLifetime: 5, burstPerMinute: 3 },
    remaining: { day: null, month: 8, freeLifetime: 5, packCredits: 0 },
  };
  const response = buildUsageResponse(
    freeProfile,
    capacity,
    3,
    new Date("2026-09-23T12:34:30.000Z"),
  );
  expect(response).toMatchObject({
    plan: { tier: "free", status: "free", isPaid: false },
    limits: {
      freeLifetime: 5,
      daily: null,
      monthly: 8,
      burstPerMinute: 3,
      packCredits: 0,
    },
    remaining: {
      freeLifetime: 5,
      daily: null,
      monthly: 8,
      minute: 3,
      packCredits: 0,
    },
    resetsAt: {
      minute: "2026-09-23T12:35:00.000Z",
      daily: null,
      monthly: null,
    },
    pricing: {
      currency: "EUR",
      tiers: {
        starter: { monthly: 3.99 },
        pro: { monthly: 9.99 },
        business: { monthly: 19.99 },
      },
      creditPack: { credits: 20, price: 5.99 },
    },
  });
  expect(JSON.stringify(response)).not.toContain("stripe_customer_id");
});

it("handles paused and missing profiles without an upsert", async () => {
  expect(
    buildUsageResponse(
      { ...freeProfile, account_status: "paused" },
      pausedCapacity,
      3,
      now,
    ).canGenerate,
  ).toBe(false);
  const missing = await invokeUsageWithProfile(null, { code: "PGRST116" });
  expect(missing).toMatchObject({
    statusCode: 404,
    body: { error: "Usage account was not found.", code: "profile_not_found" },
  });
  expect(supabase.from("profiles").upsert).not.toHaveBeenCalled();
});

it("uses UTC reset boundaries and the explicit minute fallback", async () => {
  expect(getUtcResetBoundary(new Date("2026-09-30T23:59:30.000Z"), "day")).toBe(
    "2026-10-01T00:00:00.000Z",
  );
  expect(
    getUtcResetBoundary(new Date("2026-09-30T23:59:30.000Z"), "month"),
  ).toBe("2026-10-01T00:00:00.000Z");
  minuteRemainingMock.mockResolvedValue(2);
  const response = await invokeUsageWithCapacity(
    {
      remaining: { day: 4, month: 40, packCredits: 0 },
      limits: { daily: 10, monthly: 50, burstPerMinute: 3 },
    },
    undefined,
  );
  expect(response.body.remaining.minute).toBe(2);
});
```

- [ ] **Step 2: Run the focused endpoint test to verify it fails.**

Run: `pnpm exec vitest run src/api/__tests__/userUsageEndpoint.test.ts`

Expected: FAIL because the usage service, GET CORS, minute fallback, and endpoint do not exist.

- [ ] **Step 3: Implement the server projection and GET handler.**

Authenticate with `supabase.auth.getUser`, select the explicit profile fields including `current_period_end` and `account_status`, map `isAccountPaused(profile)` to `plan.status: "paused"` and `canGenerate: false`, map a non-active account status to `inactive`, and preserve payment-required capacity and server messages. A `PGRST116` or missing ID returns read-only 404 and never upserts. Use `getEffectiveTier` and `getTierConfigForProfile` for limits, map `getAllPaidTiers()` using each `monthlyPrice`, and map `CREDIT_PACK_CONFIG.credits` and `.priceEur`. Return ISO reset boundaries only for applicable non-null limits, `current_period_end` as `subscriptionPeriodEnd`, `Cache-Control: private, no-store`, and no raw profile or Stripe fields.

- [ ] **Step 4: Implement and test the public limiter helpers without changing extension methods.**

Add `getGenerationMinuteRemaining` around the existing private minute counter. Add `commitGenerationReservationVerified` in the later idempotency task, but keep `commitGenerationReservation`'s current void and swallowed-error behavior for extension callers. Do not change `GenerationCapacity` field names: fixtures use `limits.monthly: number` and `remaining.day` and `remaining.month`.

- [ ] **Step 5: Run usage, account-pause, and type checks.**

Run: `pnpm exec vitest run src/api/__tests__/userUsageEndpoint.test.ts src/utils/__tests__/accountPause.test.ts && pnpm run type-check`

Expected: PASS. Free, paid, paused, inactive, payment-required, missing-profile, minute-fallback, and reset-boundary cases are covered without a profile write.

- [ ] **Step 6: Commit the usage contract.**

```bash
git add utils/userUsage.ts api/user/usage.ts utils/rateLimiter.ts utils/usageCors.ts src/api/__tests__/userUsageEndpoint.test.ts
git commit -m "feat: add authenticated mobile usage projection"
```

### Task 3: Web magic-link callback selection

**Prerequisites:** Backend Task 1.

**Files:**

- Modify: `api/auth/magic-link.ts: validated mobile callback and CORS headers`
- Test: `src/api/__tests__/magicLinkEndpoint.test.ts`

**Interfaces:**

- Consumes `getMobileWebClient` and `getMobileWebCallbackUrl` from Task 1.
- Produces a request body contract where only `client: "mobile_web"` selects the fixed app callback. Absent or unknown context retains the existing extension callback behavior; an exact mobile client while `MOBILE_WEB_APP_ENABLED` is not `"true"` returns the defined `mobile_web_disabled` response and never falls back to the extension callback.

- [ ] **Step 1: Add failing tests for mobile callback, extension callback, redirect injection, OTP content, and cooldown.**

```ts
it("uses the app callback only for the validated mobile client", async () => {
  await invokeMagicLink({
    email: "seller@example.com",
    client: "mobile_web",
    redirectTo: "https://evil.example",
  });
  expect(generateLink).toHaveBeenCalledWith(
    expect.objectContaining({
      options: { redirectTo: "https://autolister.app/app/auth/callback" },
    }),
  );
});

it("mobile_callback_and_existing_otp_email", async () => {
  await invokeMagicLink({
    email: "seller@example.com",
    redirectTo: "https://evil.example",
  });
  expect(generateLink).toHaveBeenCalledWith(
    expect.objectContaining({
      options: { redirectTo: "https://autolister.app/auth/callback" },
    }),
  );
  expect(resendSend).toHaveBeenCalledWith(
    expect.objectContaining({ html: expect.stringContaining("email_otp") }),
  );
});
```

- [ ] **Step 2: Run the complete focused auth test to verify it fails.**

Run: `pnpm exec vitest run src/api/__tests__/magicLinkEndpoint.test.ts`

Expected: FAIL for the new mobile assertions while the existing HTTPS callback, OTP email, and cooldown tests remain the regression baseline. The command intentionally has no filter so OTP coverage cannot be skipped.

- [ ] **Step 3: Implement the validated branch without changing email content or abuse guards.**

Parse `client`, pass only the exact mobile value through `getMobileWebClient`, choose the fixed app callback, ignore every body `redirectTo`, and keep the existing `AUTH_CALLBACK_URL` fallback for extension requests. Preserve the branded Resend HTML containing both the action link and six-digit OTP, the exact cooldown message, disposable-email rules, and all existing rate limits.

- [ ] **Step 4: Run the complete magic-link and callback regression suite.**

Run: `pnpm exec vitest run src/api/__tests__/magicLinkEndpoint.test.ts src/api/__tests__/authCallbackBridge.test.ts`

Expected: PASS for mobile callback selection, extension callback selection, OTP email content, cooldown wording, token handoff, and no extension callback changes.

- [ ] **Step 5: Commit the callback branch.**

```bash
git add api/auth/magic-link.ts src/api/__tests__/magicLinkEndpoint.test.ts
git commit -m "feat: route mobile magic links to app callback"
```

### Task 4: Atomic mobile generation idempotency and verified reservation commit

**Prerequisites:** Backend Tasks 1 and 2.

**Files:**

- Create: `utils/mobileGenerationTypes.ts`
- Create: `migrations/2026-09-23_mobile_web_generation_idempotency.sql`
- Create: `utils/mobileGenerationIdempotency.ts`
- Modify: `utils/rateLimiter.ts: verified commit and reservation status read`
- Modify: `api/generate.ts: mobile claim ordering and terminal transitions`
- Modify: `api/cron/daily-cleanup.ts: expired idempotency cleanup`
- Test: `src/utils/__tests__/mobileGenerationIdempotency.test.ts`
- Test: `src/api/__tests__/generateMobileWeb.test.ts`

**Interfaces:**

- `MobileGenerationRequestBody` exactly models the accepted generate fields: `imageUrls: string[]`, optional `languageCode`, `titleLanguageCode`, `descriptionLanguageCode`, `tone`, `useEmojis`, `useHashtags`, `emojiRetry`, `useBulletPoints`, `descriptionLength`, `descriptionFooterText`, and `generationMode`.
- `MobileGenerationResponse` is `{ title: string; description: string; measurementAdvice?: unknown; offers?: unknown }`; `normalizeMobileGenerationRequest(body: MobileGenerationRequestBody): { hash: string; imageCount: number }` never returns or stores image URL values.
- `IdempotencyClaim` is `{ kind: "new"; recordId: string } | { kind: "succeeded"; response: MobileGenerationResponse; statusCode: 200 } | { kind: "in_progress"; requestId: string } | { kind: "failed"; statusCode: 400 | 403 | 429 | 500 | 503 | 504; body: Record<string, unknown>; retryable: boolean } | { kind: "conflict" }`.
- Produces `commitGenerationReservationVerified(id): Promise<{ ok: true } | { ok: false; state: "pending" | "committed" | "refunded" | "unknown"; error?: string }>` while preserving the current void commit method for extension callers.

- [ ] **Step 1: Write failing tests for exact types, atomic replay, claim ordering, bounds, expiry, commit uncertainty, and extension bypass.**

```ts
it("hashes signed URLs without returning them and rejects an oversized stored response", () => {
  const normalized = normalizeMobileGenerationRequest({
    imageUrls: ["https://storage/signed-a"],
    titleLanguageCode: "en",
    descriptionLanguageCode: "fr",
  });
  expect(normalized.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(normalized)).not.toContain("signed-a");
  expect(
    validateStoredResponse({
      title: "x".repeat(20_000),
      description: "y".repeat(20_000),
    }),
  ).toMatchObject({ ok: false, code: "response_too_large" });
});

it("claim_is_atomic_and_replays_bounded_failure", async () => {
  const first = await callMobileGenerate({ requestId, body });
  const second = await callMobileGenerate({ requestId, body });
  expect(first.statusCode).toBe(504);
  expect(second).toEqual(first);
  expect(reserveGenerationRequest).toHaveBeenCalledTimes(1);
  advanceFakeTimeBy(IDEMPOTENCY_FAILURE_TTL_MS + 1);
  await callMobileGenerate({ requestId, body });
  expect(reserveGenerationRequest).toHaveBeenCalledTimes(2);
});

it("does not claim before deterministic validation or for extension requests", async () => {
  await callMobileGenerate({ requestId, body: { imageUrls: [] } });
  expect(claimRpc).not.toHaveBeenCalled();
  await callGenerate({ extensionVersion: "1.4.2", body: extensionBody });
  expect(claimRpc).not.toHaveBeenCalled();
});

it("does not persist success when reservation commit is uncertain", async () => {
  commitGenerationReservationVerified.mockResolvedValue({
    state: "pending",
    ok: false,
  });
  const response = await callMobileGenerate({ requestId, body });
  expect(response.statusCode).toBe(503);
  expect(completeRpc).not.toHaveBeenCalled();
  expect(markInProgressCommitPending).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail.**

Run: `pnpm exec vitest run src/utils/__tests__/mobileGenerationIdempotency.test.ts src/api/__tests__/generateMobileWeb.test.ts`

Expected: FAIL because the exact mobile types, RPCs, verified commit helper, and generate integration do not exist.

- [ ] **Step 3: Add the public-schema table and security-definer atomic RPCs.**

Create `public.mobile_generation_idempotency` with `id`, `user_id`, `client`, `request_id`, `request_hash`, `status` in `in_progress | succeeded | failed`, `retryable`, `commit_pending`, nullable `reservation_id`, bounded `response_json`, `response_status`, `failure_code`, `expires_at`, and timestamps. Add a unique `(user_id, client, request_id)` index, request-hash index, and expiry index. Enable RLS, revoke table and function privileges from `anon` and `authenticated`, and grant execution only to the service role path.

Create `public.claim_mobile_generation_idempotency(...)` as `SECURITY DEFINER SET search_path = public`. It must use one transaction with `INSERT ... ON CONFLICT DO NOTHING` followed by a locked conflict transition in the same RPC. A concurrent caller receives the existing state, a different hash returns conflict, an unexpired success or deterministic failure replays, an unexpired in-progress or commit-pending row returns in-progress, and an expired row atomically resets to in-progress. There is no client-side select-then-insert race. Add security-definer complete, fail, commit-pending, and cleanup functions with explicit `public.` qualification and grants.

- [ ] **Step 4: Implement bounded state and reservation ordering in the helper and handler.**

Validate CORS, method, bearer, profile, disposable email, duplicate-IP pause, footer, generation mode, and non-empty image URLs before claiming. Once deterministic validation passes, claim immediately before quota reservation. If reservation is denied, store a bounded deterministic failed response with status 429. On model success, call the verified commit helper before writing success. If commit is pending or unknown, keep `commit_pending` and return 503 without storing generated output. For mobile 400, 403, 429, 500, and 504 paths, refund through the existing limiter, store only a bounded sanitized error body, replay it until its TTL, and allow the same key to atomically retry after expiry. Preserve the extension's current reservation and refund path exactly, including its existing swallowed commit error behavior.

Use a 32 KiB UTF-8 bound for stored JSON and a 15-minute success or deterministic-failure TTL, with a 2-minute retryable provider-failure TTL. Never store raw signed URLs. Add daily cleanup deletion for rows with `expires_at < now() - interval '1 day'`; do not change the existing temp-upload cleanup. The authorized Supabase release procedure applies this migration after review; no plan command runs it.

- [ ] **Step 5: Run unit, mobile integration, extension generation, cleanup, and type checks.**

Run: `pnpm exec vitest run src/utils/__tests__/mobileGenerationIdempotency.test.ts src/api/__tests__/generateMobileWeb.test.ts src/api/__tests__/generateRemoteImages.test.ts src/api/__tests__/phoneUpload.test.ts && pnpm run type-check`

Expected: PASS. Duplicate success and deterministic failures replay without a second reservation, expiry permits only the same-key retry, commit uncertainty never becomes a stored success, extension behavior remains green, and cleanup covers expired rows.

- [ ] **Step 6: Commit the idempotency deliverable.**

```bash
git add utils/mobileGenerationTypes.ts migrations/2026-09-23_mobile_web_generation_idempotency.sql utils/mobileGenerationIdempotency.ts utils/rateLimiter.ts api/generate.ts api/cron/daily-cleanup.ts src/utils/__tests__/mobileGenerationIdempotency.test.ts src/api/__tests__/generateMobileWeb.test.ts
git commit -m "feat: add atomic mobile generation idempotency"
```

### Task 5: Bearer-owned Stripe checkout and portal

**Prerequisites:** Backend Tasks 1 and 2.

**Files:**

- Create: `utils/mobileCheckout.ts`
- Test: `src/api/__tests__/mobileCheckout.test.ts`
- Modify: `api/stripe/create-checkout.ts: branch before resolveCheckoutEmail`
- Modify: `api/stripe/create-portal.ts: branch before email lookup`
- Modify: `utils/checkoutCors.ts: preserve POST policy and add bearer headers`

**Interfaces:**

- Produces `MobileBillingProfile = { id: string; email: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string; subscription_tier: string }`, `resolveMobileBillingProfile(req): Promise<MobileBillingProfile>`, `getMobileCheckoutUrls(input: { origin?: string; status: "success" | "cancel" }): string`, and `getMobilePortalReturnUrl(origin?: string): string`.
- `getMobileCheckoutUrls` and `getMobilePortalReturnUrl` accept only production or configured preview app origins and return `/app` paths. They never accept a request-supplied arbitrary return URL.
- Consumes bearer auth, profile lookup by authenticated user ID, `TIER_CONFIGS`, existing Stripe customer reuse, offer validation, and webhook-owned subscription updates.

- [ ] **Step 1: Write failing tests for branch ordering, bearer ownership, profile fields, customer/session metadata, portal return, and extension compatibility.**

```ts
it("authenticates before resolveCheckoutEmail and ignores client ownership fields", async () => {
  const response = await invokeCheckout({
    headers: {
      authorization: "Bearer token",
      "x-autolister-client": "mobile_web",
    },
    body: {
      tier: "starter",
      email: "attacker@example.com",
      userId: "other-user",
    },
  });
  expect(response.statusCode).toBe(200);
  expect(resolveCheckoutEmail).not.toHaveBeenCalled();
  expect(profileLookupById).toHaveBeenCalledWith("bearer-user");
  expect(stripe.customers.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ source: "mobile_web" }),
    }),
  );
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ source: "mobile_web" }),
      success_url:
        "https://autolister.app/app?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    }),
  );
});

it("bearer_owns_mobile_checkout_and_portal_return", async () => {
  const mobilePortal = await invokeCheckoutWithActiveProfile({
    client: "mobile_web",
  });
  expect(mobilePortal.body.mode).toBe("portal");
  expect(createBillingPortalSessionForProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      customerId: "cus_owner",
      subscriptionId: "sub_owner",
      returnUrl: "https://autolister.app/app?checkout=manage",
    }),
  );
  const extension = await invokeCheckout({
    body: { email: "extension@example.com", tier: "starter" },
  });
  expect(extension.statusCode).toBe(200);
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ source: "auto_lister_extension" }),
    }),
  );
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `pnpm exec vitest run src/api/__tests__/mobileCheckout.test.ts src/api/__tests__/createCheckoutExistingSubscriber.test.ts`

Expected: FAIL for the new bearer assertions while the pre-existing extension cases remain the regression baseline.

- [ ] **Step 3: Implement mobile branches before legacy email resolution.**

Detect the exact mobile client before destructuring the legacy ownership inputs. Require bearer auth, load the selected profile fields by `user.id`, reject missing or invalid profile email, validate tier from `TIER_CONFIGS`, and ignore body email, user ID, source override, and return URL. Set `source: "mobile_web"` in the checkout session metadata and new customer metadata. If the selected profile already has a manageable customer and active subscription, call the existing portal helper with `getMobilePortalReturnUrl()` instead of the extension `STRIPE_PORTAL_RETURN_URL`. In `create-portal.ts`, branch before email validation, use the same selected fields, and return to `/app`.

- [ ] **Step 4: Run billing, webhook, and type checks.**

Run: `pnpm exec vitest run src/api/__tests__/mobileCheckout.test.ts src/api/__tests__/createCheckoutExistingSubscriber.test.ts src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts && pnpm run type-check`

Expected: PASS. Web ownership is bearer-derived, active subscribers return to `/app`, mobile metadata is present on customer and session where created, and extension checkout and webhook behavior remain unchanged.

- [ ] **Step 5: Commit the billing branches.**

```bash
git add utils/mobileCheckout.ts api/stripe/create-checkout.ts api/stripe/create-portal.ts utils/checkoutCors.ts src/api/__tests__/mobileCheckout.test.ts
git commit -m "feat: add bearer-owned web billing branches"
```

### Task 6: Exact private headers, flag regression, and full server gate

**Prerequisites:** Backend Tasks 1 through 5.

**Files:**

- Modify: `vercel.json: app and callback X-Robots-Tag rules`
- Modify: `api/user/usage.ts: disabled mobile response if required by shared flag`
- Modify: `utils/mobileWeb.ts: final flag contract`
- Modify: `src/api/__tests__/mobileWebConfig.test.ts`
- Modify: `src/api/__tests__/generateMobileWeb.test.ts: extension regression cases`

**Interfaces:**

- Produces exact `X-Robots-Tag: noindex, nofollow` rules for both `/app/(.*)` and `/app/auth/callback/(.*)`. The static app plan owns the exact build-time CSP meta tag with `img-src 'self' data: blob:` and the configured Supabase origin, so this Vercel header does not contain `img-src https:`.
- When `MOBILE_WEB_APP_ENABLED` is not exactly `"true"`, new mobile API branches return 404 `{ error: "Mobile web app unavailable.", code: "mobile_web_disabled" }`; extension requests keep existing behavior. The static app uses the separate build-time `PUBLIC_MOBILE_WEB_APP_ENABLED === "true"` contract and renders a disabled notice without loading auth or generation code when false.

- [ ] **Step 1: Write failing header and flag tests.**

```ts
it("covers both app documents and disables only mobile traffic", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  for (const source of ["/app/(.*)", "/app/auth/callback/(.*)"]) {
    const headers = vercel.headers.find(
      (entry: any) => entry.source === source,
    ).headers;
    expect(headers).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow",
    });
  }
  expect(
    isMobileWebEnabled({ MOBILE_WEB_APP_ENABLED: "true" } as NodeJS.ProcessEnv),
  ).toBe(true);
  expect(
    isMobileWebEnabled({ MOBILE_WEB_APP_ENABLED: "1" } as NodeJS.ProcessEnv),
  ).toBe(false);
});
```

- [ ] **Step 2: Run the focused config test to verify it fails.**

Run: `pnpm exec vitest run src/api/__tests__/mobileWebConfig.test.ts`

Expected: FAIL because the two header rules and exact flag response contract do not exist.

- [ ] **Step 3: Add headers and disabled mobile responses without changing existing rewrites or cron entries.**

Add only the two private route header patterns to `vercel.json`. Keep CSP construction in the static app plan, where the build-time `PUBLIC_SUPABASE_URL` can be validated and serialized as one exact origin. Gate mobile usage, magic-link, generation, and billing branches with the server flag; preserve extension requests and phone-upload CORS. Add tests for the disabled response and for the existing phone-upload preflight.

- [ ] **Step 4: Run all focused regressions and the production verification command.**

Run: `pnpm exec vitest run src/api/__tests__/mobileWebConfig.test.ts src/api/__tests__/mobileWebCors.test.ts src/api/__tests__/generateMobileWeb.test.ts src/api/__tests__/magicLinkEndpoint.test.ts src/api/__tests__/createCheckoutExistingSubscriber.test.ts src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts src/api/__tests__/phoneUpload.test.ts src/api/__tests__/eventsTrack.test.ts src/api/__tests__/attributionClaim.test.ts && pnpm run verify:production`

Expected: PASS for focused regressions and `pnpm run verify:production` completes lint, type-check, Astro build, format-check, and the complete Vitest suite. Do not run `pnpm run push:production` or a Supabase migration command.

- [ ] **Step 5: Commit only backend foundation files.**

```bash
git add vercel.json api/user/usage.ts utils/mobileWeb.ts src/api/__tests__/mobileWebConfig.test.ts src/api/__tests__/generateMobileWeb.test.ts
git commit -m "chore: gate mobile web server rollout"
```

## Handoff and release boundary

The app-client plan may begin only after the interfaces in Tasks 1 through 5 are reviewed and Task 6 is green. It must use `/api/user/usage`, V2 phone upload, `/api/generate` with the two mobile headers, and bearer billing exactly as specified here. The acquisition plan may add public routes only after the app-client real-device gates pass. The release owner applies the idempotency migration through the authorized Supabase procedure, verifies Supabase, Resend, Stripe, CORS, CSP, and flag values in preview or staging, and separately approves production rollout.
