# Mobile Web Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the authenticated `mobile_web` server contracts required by `/app` while preserving every existing extension, callback, quota, Stripe, upload, and Orion contract.

**Architecture:** A small context helper identifies mobile web requests without pretending to be an extension. A read-only usage service and bearer-owned billing branches reuse `tierConfig`, `rateLimiter`, Supabase, and Stripe helpers. Generation idempotency is a mobile-only additive table and state machine inserted before reservation, while the existing extension path remains byte-for-byte compatible at the request-contract boundary.

**Tech Stack:** Node 20+, TypeScript 5.8, Vercel handlers, Astro static deployment, Supabase service-role client and RPCs, Stripe 18, Vitest 4, PostgreSQL migration SQL, existing CORS and Resend helpers.

**Spec:** `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`

## Global Constraints

- `X-Autolister-Client: mobile_web` is opt-in and the extension version header is never spoofed.
- Existing extension request and response contracts, `/auth/callback`, `chrome.storage`, Orion runtime behavior, and extension checkout remain unchanged.
- `GET /api/user/usage` is bearer-authenticated, read-only, `Cache-Control: private, no-store`, and is the only browser quota and subscription summary contract.
- Quota decisions continue to use `utils/rateLimiter.ts` and `utils/tierConfig.ts`; no second quota ledger or client database read is introduced.
- `/api/generate` keeps one structured model call returning both `title` and `description`, with the existing parser, prompt branches, reservation, commit, and refund behavior.
- The free plan remains five lifetime generations. Paid prices remain Starter EUR 3.99, Pro EUR 9.99, Business EUR 19.99, and the existing 20-credit pack remains EUR 5.99.
- Mobile idempotency stores only a normalized request hash, status, reservation reference, response, and bounded expiry. It never stores raw photos, base64 data, signed URL values, generated logs, or access tokens.
- Only `https://autolister.app`, configured preview origins, and already-approved Vinted origins are allowed where endpoint CORS requires them. Credentialed wildcard CORS is forbidden.
- Mobile checkout and portal ownership come from the bearer user. Client email and user IDs are ignored in the web branch.
- Web auth accepts only the allowlisted `/app/auth/callback` redirect. An arbitrary redirect URL is never accepted from the request body.
- Stripe webhook entitlement and usage-period reset logic remains authoritative and is not duplicated in checkout responses.
- No production deployment, environment mutation, Stripe live action, Supabase migration execution, or webhook configuration change is part of implementation. Those require the release gate in the approved spec.
- Run commands from `/home/mests/projects/quick-vint-api`; preserve all unrelated dirty files and stage only files owned by the current task.

## Review Focus

1. A repeated mobile request after a timeout must not reserve a second generation. Pin this to `replays_same_mobile_request_without_second_reservation` in Task 4.
2. A client-supplied email or user ID must not own a web checkout or portal session. Pin this to `bearer_owns_mobile_checkout_and_portal` in Task 5.
3. A request without `mobile_web` must retain the extension pricing mode and legacy CORS behavior. Pin this to `extension_request_omits_mobile_context` in Task 1.
4. Free, paid, legacy, and inactive profiles must produce server-authoritative limits and reset fields without leaking profile rows. Pin this to `usage_contract_redacts_profile_and_maps_limits` in Task 2.
5. A web auth request must choose the web callback while an extension request still chooses the extension callback, even when a malicious redirect field is present. Pin this to `web_callback_is_allowlisted_and_extension_default_is_unchanged` in Task 3.

---

## File structure map

| File                                                          | Responsibility                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/mobileWeb.ts`                                          | Canonical client-context parser, mobile feature flag, web callback and return URL allowlists, pricing-mode selection inputs, and request ID validation. |
| `utils/userUsage.ts`                                          | Server-side profile-to-usage projection using `getGenerationCapacity`, tier pricing, and reset-time helpers. It exposes no Supabase row shape.          |
| `api/user/usage.ts`                                           | `GET /api/user/usage` bearer handler, CORS, auth, response headers, and error mapping.                                                                  |
| `utils/mobileGenerationIdempotency.ts`                        | Request normalization, SHA-256 hash, claim, in-progress, success, and failure transitions for `mobile_web`.                                             |
| `migrations/2026-09-23_mobile_web_generation_idempotency.sql` | Additive table, unique mobile key, expiry index, ownership policy, and no-photo-column contract.                                                        |
| `utils/mobileCheckout.ts`                                     | Bearer ownership and bounded web billing return URL helpers shared by checkout and portal handlers.                                                     |
| `api/generate.ts`                                             | Additive mobile context, allowed headers, and idempotency integration; extension generation path stays intact.                                          |
| `api/auth/magic-link.ts`                                      | Validated `client: "mobile_web"` callback branch while preserving extension default.                                                                    |
| `api/stripe/create-checkout.ts`                               | Bearer-owned web checkout branch with `mobile_web` metadata and `/app` return.                                                                          |
| `api/stripe/create-portal.ts`                                 | Bearer-owned web portal branch with `/app` return.                                                                                                      |
| `utils/checkoutCors.ts`                                       | Adds the required authorization and mobile context headers without changing existing origin policy.                                                     |
| `vercel.json`                                                 | Additive app response headers for noindex and the explicitly approved browser CSP contract.                                                             |
| `src/utils/__tests__/mobileWeb.test.ts`                       | Pure context, allowlist, and feature-flag tests.                                                                                                        |
| `src/api/__tests__/userUsageEndpoint.test.ts`                 | Usage endpoint auth, projection, reset, caching, and redaction tests.                                                                                   |
| `src/api/__tests__/magicLinkEndpoint.test.ts`                 | Existing plus mobile callback and malicious redirect regression tests.                                                                                  |
| `src/utils/__tests__/mobileGenerationIdempotency.test.ts`     | Pure hash and state-transition tests with a mocked Supabase store.                                                                                      |
| `src/api/__tests__/generateMobileWeb.test.ts`                 | Mobile generation integration contract and extension regression tests.                                                                                  |
| `src/api/__tests__/mobileCheckout.test.ts`                    | Bearer checkout and portal ownership, return URL, and metadata tests.                                                                                   |
| `src/api/__tests__/mobileWebConfig.test.ts`                   | Flag, CORS header, CSP, and noindex header contract tests.                                                                                              |

## Dependencies and execution order

Implement Tasks 1 through 6 in order. Task 1 defines the context and allowlists consumed by Tasks 2 through 5. Task 2 is independent at runtime but consumes Task 1's bearer and pricing helpers. Task 3 can be reviewed independently after Task 1. Task 4 depends on Task 1's request ID parser and Task 2's shared profile semantics only for tests. Task 5 depends on Task 1's web return URL helper. Task 6 locks deployment headers and runs the extension regression suite after all server branches exist. The app-client plan consumes the interfaces from Tasks 1 through 5. The acquisition plan consumes only the stable app route from the client plan and does not modify this plan's server contracts.

### Task 1: Mobile context, pricing mode, and CORS contract

**Files:**

- Create: `utils/mobileWeb.ts`
- Test: `src/utils/__tests__/mobileWeb.test.ts`
- Modify: `utils/tierConfig.ts: pricing-mode exports`
- Modify: `api/generate.ts: CORS allowed headers`
- Modify: `utils/checkoutCors.ts: allowed request headers`

**Interfaces:**

- Produces `MOBILE_WEB_CLIENT = "mobile_web"`, `getMobileWebClient(value: unknown): "mobile_web" | null`, `getPricingLimitsModeForClient(args: { client?: unknown; extensionVersion?: string | null }): PricingLimitsMode`, `isMobileWebEnabled(env?: NodeJS.ProcessEnv): boolean`, `getMobileWebCallbackUrl(origin?: string): string`, `getMobileWebReturnUrl(value: unknown): string | null`, and `isValidMobileRequestId(value: unknown): boolean`.
- Consumes the existing `PricingLimitsMode`, `getPricingLimitsModeForExtension`, and existing origin helpers. It must not alter the meaning of an extension version.

- [ ] **Step 1: Write the failing tests for context selection and allowlists.**

```ts
it("keeps extension pricing mode when the mobile context is absent", () => {
  expect(getPricingLimitsModeForClient({ extensionVersion: "1.4.2" })).toBe(
    getPricingLimitsModeForExtension("1.4.2"),
  );
});

it("accepts only the fixed web callback and a UUID request id", () => {
  expect(getMobileWebCallbackUrl("https://autolister.app")).toBe(
    "https://autolister.app/app/auth/callback",
  );
  expect(getMobileWebReturnUrl("https://evil.example/app")).toBeNull();
  expect(isValidMobileRequestId("00000000-0000-4000-8000-000000000001")).toBe(
    true,
  );
  expect(isValidMobileRequestId("session-1")).toBe(false);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/utils/__tests__/mobileWeb.test.ts`

Expected: FAIL because `utils/mobileWeb.ts` and its exported contracts do not exist.

- [ ] **Step 3: Implement the smallest pure context module and add header names to existing CORS lists.**

```ts
export const MOBILE_WEB_CLIENT = "mobile_web" as const;
export const MOBILE_WEB_CALLBACK_PATH = "/app/auth/callback";
export const MOBILE_WEB_REQUEST_ID_HEADER = "X-Autolister-Request-Id";

export function getMobileWebClient(value: unknown) {
  return value === MOBILE_WEB_CLIENT ? MOBILE_WEB_CLIENT : null;
}

export function getPricingLimitsModeForClient(args: {
  client?: unknown;
  extensionVersion?: string | null;
}) {
  return getMobileWebClient(args.client)
    ? getPricingLimitsMode()
    : getPricingLimitsModeForExtension(args.extensionVersion);
}
```

Use the existing origin predicates for URL checks, return `https://autolister.app/app` when no approved web return URL is supplied, and treat `MOBILE_WEB_APP_ENABLED=false` as disabled while defaulting to enabled for existing deployments. Add `X-Autolister-Client` and `X-Autolister-Request-Id` only to the API allowlists. Do not change payload validation or extension headers.

- [ ] **Step 4: Run the focused tests and extension CORS tests.**

Run: `npx vitest run src/utils/__tests__/mobileWeb.test.ts src/api/__tests__/generateRemoteImages.test.ts`

Expected: PASS, with existing extension tests still observing their prior pricing mode and origin behavior.

- [ ] **Step 5: Commit the context contract.**

```bash
git add utils/mobileWeb.ts utils/tierConfig.ts api/generate.ts utils/checkoutCors.ts src/utils/__tests__/mobileWeb.test.ts
git commit -m "feat: add mobile web request context contract"
```

### Task 2: Authenticated usage service and endpoint

**Files:**

- Create: `utils/userUsage.ts`
- Create: `api/user/usage.ts`
- Test: `src/api/__tests__/userUsageEndpoint.test.ts`

**Interfaces:**

- Produces `UsageResponse`, `buildUsageResponse(profile: UserProfile, capacity: GenerationCapacity, now: Date): UsageResponse`, and `getUsageForBearer(token: string): Promise<UsageResponse>`.
- Consumes `supabase.auth.getUser`, the existing profile select fields from `api/generate.ts`, `getEffectiveTier`, `getTierConfig`, `CREDIT_PACK_CONFIG`, `getPricingLimitsModeForClient`, and `RateLimiter.getGenerationCapacity`.

- [ ] **Step 1: Write failing tests for auth, redaction, free capacity, paid capacity, and reset values.**

```ts
it("maps a free capacity result to the stable public contract", () => {
  const response = buildUsageResponse(
    freeProfile,
    {
      allowed: true,
      tier: "free",
      available: 5,
      limits: {
        freeLifetime: 5,
        daily: null,
        monthly: null,
        burstPerMinute: 3,
      },
      remaining: {
        freeLifetime: 5,
        minute: 3,
        day: null,
        month: null,
        packCredits: 0,
      },
    },
    new Date("2026-09-23T12:34:00.000Z"),
  );
  expect(response).toMatchObject({
    plan: { tier: "free", isPaid: false },
    limits: {
      freeLifetime: 5,
      daily: null,
      monthly: null,
      burstPerMinute: 3,
      packCredits: 0,
    },
    remaining: {
      freeLifetime: 5,
      minute: 3,
      daily: null,
      monthly: null,
      packCredits: 0,
    },
    canGenerate: true,
    pricing: {
      currency: "EUR",
      tiers: { starter: { monthly: 3.99 } },
      creditPack: { credits: 20, price: 5.99 },
    },
  });
  expect(JSON.stringify(response)).not.toContain("stripe_customer_id");
});

it("returns 401 and no profile data for an invalid bearer", async () => {
  const response = await invokeUsage({
    method: "GET",
    headers: { authorization: "Bearer expired" },
  });
  expect(response.statusCode).toBe(401);
  expect(response.body).toEqual({ error: "Unauthorized" });
});
```

- [ ] **Step 2: Run the endpoint test to verify it fails.**

Run: `npx vitest run src/api/__tests__/userUsageEndpoint.test.ts`

Expected: FAIL because the handler and usage projection do not exist.

- [ ] **Step 3: Implement the shared projection and bearer handler.**

```ts
export type UsageResponse = {
  plan: { tier: string; status: string; isPaid: boolean };
  limits: {
    freeLifetime: number | null;
    daily: number | null;
    monthly: number | null;
    burstPerMinute: number | null;
    packCredits: number;
  };
  remaining: {
    freeLifetime: number | null;
    daily: number | null;
    monthly: number | null;
    minute: number | null;
    packCredits: number;
  };
  resetsAt: {
    minute: string | null;
    daily: string | null;
    monthly: string | null;
    subscriptionPeriodEnd: string | null;
  };
  canGenerate: boolean;
  pricing: {
    currency: "EUR";
    tiers: Record<string, { monthly: number }>;
    creditPack: { credits: number; price: number };
  };
};
```

Authenticate with `supabase.auth.getUser(token)`, select only the profile fields already used by `RateLimiter`, call `getGenerationCapacity`, project null for non-applicable limits, compute only the next shared window boundaries and stored subscription period end, and never serialize the profile row. Set `Cache-Control: private, no-store`, use the shared CORS helper, and return 500 with a generic error string if the server projection fails.

- [ ] **Step 4: Run focused tests and type-check the endpoint.**

Run: `npx vitest run src/api/__tests__/userUsageEndpoint.test.ts && npm run type-check`

Expected: PASS, and `tsc --noEmit` exits 0 with the exact stable response fields.

- [ ] **Step 5: Commit the usage contract.**

```bash
git add utils/userUsage.ts api/user/usage.ts src/api/__tests__/userUsageEndpoint.test.ts
git commit -m "feat: add authenticated mobile usage endpoint"
```

### Task 3: Web magic-link callback selection

**Files:**

- Modify: `api/auth/magic-link.ts: callback selection and allowed headers`
- Test: `src/api/__tests__/magicLinkEndpoint.test.ts`

**Interfaces:**

- Consumes `getMobileWebClient` and `getMobileWebCallbackUrl` from Task 1.
- Produces a request body contract where only `client: "mobile_web"` selects `https://autolister.app/app/auth/callback`; absent or unknown client values retain `DEFAULT_AUTH_CALLBACK_URL` and the existing extension behavior.

- [ ] **Step 1: Add failing tests for both callback branches and redirect injection.**

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

it("keeps extension callback behavior for an omitted client", async () => {
  await invokeMagicLink({
    email: "seller@example.com",
    redirectTo: "https://evil.example",
  });
  expect(generateLink).toHaveBeenCalledWith(
    expect.objectContaining({
      options: { redirectTo: "https://autolister.app/auth/callback" },
    }),
  );
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/api/__tests__/magicLinkEndpoint.test.ts`

Expected: FAIL because the handler currently ignores a web client context and has no app callback branch.

- [ ] **Step 3: Implement the validated branch without changing email content or abuse guards.**

Parse `client` from the existing JSON body, pass only `mobile_web` through `getMobileWebClient`, choose the fixed app callback for that value, ignore every body `redirectTo`, and leave the existing `AUTH_CALLBACK_URL` and fallback behavior unchanged for all other requests. Keep the single branded email with both `action_link` and `email_otp`, the exact cooldown message, and existing disposable-email checks.

- [ ] **Step 4: Run focused auth tests, including OTP and cooldown regressions.**

Run: `npx vitest run src/api/__tests__/magicLinkEndpoint.test.ts -t "callback|OTP|cooldown"`

Expected: PASS for mobile callback selection, extension callback selection, OTP email content, and the existing 429 wording.

- [ ] **Step 5: Commit the callback branch.**

```bash
git add api/auth/magic-link.ts src/api/__tests__/magicLinkEndpoint.test.ts
git commit -m "feat: route mobile magic links to app callback"
```

### Task 4: Mobile generation idempotency

**Files:**

- Create: `migrations/2026-09-23_mobile_web_generation_idempotency.sql`
- Create: `utils/mobileGenerationIdempotency.ts`
- Test: `src/utils/__tests__/mobileGenerationIdempotency.test.ts`
- Test: `src/api/__tests__/generateMobileWeb.test.ts`
- Modify: `api/generate.ts: mobile context before reservation and terminal state writes`

**Interfaces:**

- Produces `normalizeMobileGenerationRequest(body: GenerateBody): { hash: string; imageCount: number }`, `claimMobileGeneration(input): Promise<IdempotencyClaim>`, `completeMobileGeneration(input): Promise<void>`, and `failMobileGeneration(input): Promise<void>`.
- `IdempotencyClaim` is `{ kind: "new"; recordId: string } | { kind: "success"; response: GenerateResponse } | { kind: "in_progress"; requestId: string } | { kind: "conflict" }`.
- Consumes Task 1's validated client and UUID request ID, Supabase service role, and existing reservation IDs. No extension call invokes the helper.

- [ ] **Step 1: Write failing unit and handler tests for hash stability, duplicate success, in-progress replay, conflict, and extension bypass.**

```ts
it("hashes signed image URLs without storing them", () => {
  const result = normalizeMobileGenerationRequest({
    imageUrls: ["https://storage/signed-a"],
    titleLanguageCode: "en",
    descriptionLanguageCode: "fr",
    descriptionLength: "long",
    useBulletPoints: true,
  });
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain("signed-a");
});

it("replays a successful mobile request without reserving twice", async () => {
  const first = await callGenerate({ client: "mobile_web", requestId, body });
  const second = await callGenerate({ client: "mobile_web", requestId, body });
  expect(first.statusCode).toBe(200);
  expect(second).toEqual(first);
  expect(reserveGenerationRequest).toHaveBeenCalledTimes(1);
  expect(openAi).toHaveBeenCalledTimes(1);
});

it("bypasses the idempotency table for an extension request", async () => {
  await callGenerate({ extensionVersion: "1.4.2", body: extensionBody });
  expect(claimMobileGeneration).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run both focused tests to verify they fail.**

Run: `npx vitest run src/utils/__tests__/mobileGenerationIdempotency.test.ts src/api/__tests__/generateMobileWeb.test.ts`

Expected: FAIL because no migration, state store, or mobile integration exists.

- [ ] **Step 3: Add the additive table and pure normalization/state store.**

Create `mobile_generation_idempotency` with `id`, `user_id`, `client`, `request_id`, `request_hash`, `status`, nullable `reservation_id`, nullable `response`, nullable `response_status`, `expires_at`, `created_at`, and `updated_at`; enforce `client = 'mobile_web'`, a unique `(user_id, client, request_id)`, an expiry index, and RLS that denies browser access. The migration must contain no raw image, signed URL, or output-text column beyond the bounded response JSON required for a replay.

Hash a canonical object containing generation options and SHA-256 digests of image URL values, never the URL values themselves. Atomically claim with the unique key, return an existing success or in-progress record, return conflict for a different hash, and permit a bounded retry only after the existing record's expiry policy. Store the response only after the existing reservation commit succeeds. Keep a 5xx or 504 record in progress so the same request ID is the only safe retry.

- [ ] **Step 4: Integrate the state machine around the existing reservation and model call.**

Read and validate `X-Autolister-Client` and `X-Autolister-Request-Id` after bearer authentication. For `mobile_web`, claim before `reserveGenerationRequest`, return stored success or `202` in-progress without calling the model, pass `getPricingLimitsModeForClient` to the existing limiter, complete after `commitGenerationReservation`, and mark failure after the existing refund path for deterministic validation failures. Preserve the exact extension body fields, status codes, parser, footer, and refund semantics.

- [ ] **Step 5: Run unit, mobile integration, extension generation, and type checks.**

Run: `npx vitest run src/utils/__tests__/mobileGenerationIdempotency.test.ts src/api/__tests__/generateMobileWeb.test.ts src/api/__tests__/generateRemoteImages.test.ts && npm run type-check`

Expected: PASS. A duplicate mobile request has one reservation and one model call. Existing extension tests pass without requiring new headers.

- [ ] **Step 6: Commit the idempotency deliverable.**

```bash
git add migrations/2026-09-23_mobile_web_generation_idempotency.sql utils/mobileGenerationIdempotency.ts api/generate.ts src/utils/__tests__/mobileGenerationIdempotency.test.ts src/api/__tests__/generateMobileWeb.test.ts
git commit -m "feat: make mobile generation requests idempotent"
```

### Task 5: Bearer-owned Stripe checkout and portal

**Files:**

- Create: `utils/mobileCheckout.ts`
- Test: `src/api/__tests__/mobileCheckout.test.ts`
- Modify: `api/stripe/create-checkout.ts: mobile bearer branch`
- Modify: `api/stripe/create-portal.ts: mobile bearer branch`
- Modify: `utils/checkoutCors.ts: mobile authorization headers`

**Interfaces:**

- Produces `resolveMobileBillingUser(req): Promise<{ id: string; email: string }>` and `getMobileCheckoutUrls(input: { origin?: string; status?: "success" | "cancel" }): { successUrl: string; cancelUrl: string }`.
- Consumes Supabase bearer auth, profile lookup by `user.id`, `TIER_CONFIGS`, existing Stripe customer reuse, offer validation, and webhook-owned subscription updates.

- [ ] **Step 1: Write failing tests for bearer ownership, return URLs, metadata, and extension compatibility.**

```ts
it("ignores client email and user id for a mobile checkout", async () => {
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
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      customer_email: "bearer-owner@example.com",
      metadata: expect.objectContaining({ source: "mobile_web" }),
      success_url:
        "https://autolister.app/app?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    }),
  );
});

it("keeps the extension branch available without a bearer token", async () => {
  const response = await invokeCheckout({
    body: { email: "extension@example.com", tier: "starter" },
  });
  expect(response.statusCode).toBe(200);
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ source: "auto_lister_extension" }),
    }),
  );
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/api/__tests__/mobileCheckout.test.ts src/api/__tests__/createCheckoutExistingSubscriber.test.ts`

Expected: FAIL for the new bearer assertions while the pre-existing extension cases remain the regression baseline.

- [ ] **Step 3: Implement mobile ownership and bounded `/app` return URLs.**

When `X-Autolister-Client` is `mobile_web`, require `Authorization`, call `supabase.auth.getUser`, load the matching profile by authenticated ID, ignore `email`, `userId`, and arbitrary return fields, validate the tier against `TIER_CONFIGS`, and use `https://autolister.app/app?checkout=success&session_id={CHECKOUT_SESSION_ID}` plus a bounded cancel marker. Record `source: "mobile_web"` in Stripe metadata. In the portal branch, resolve the customer ID from the bearer-owned profile and return to `/app`. Leave the current extension branch, payload, coupon, existing-subscriber portal behavior, and metadata untouched.

- [ ] **Step 4: Run billing, webhook, and type-check regressions.**

Run: `npx vitest run src/api/__tests__/mobileCheckout.test.ts src/api/__tests__/createCheckoutExistingSubscriber.test.ts src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts && npm run type-check`

Expected: PASS. Web checkout and portal ownership is bearer-derived, and webhook entitlement and reset tests remain green.

- [ ] **Step 5: Commit the billing branches.**

```bash
git add utils/mobileCheckout.ts api/stripe/create-checkout.ts api/stripe/create-portal.ts utils/checkoutCors.ts src/api/__tests__/mobileCheckout.test.ts
git commit -m "feat: add bearer-owned web billing branches"
```

### Task 6: Headers, feature flag, and full server regression gate

**Files:**

- Modify: `vercel.json: additive app headers`
- Modify: `utils/mobileWeb.ts: deployment flag and origin configuration`
- Create: `src/api/__tests__/mobileWebConfig.test.ts`
- Modify: `src/api/__tests__/generateMobileWeb.test.ts: extension regression cases`

**Interfaces:**

- Produces a deploy-config contract in which `MOBILE_WEB_APP_ENABLED` and `PUBLIC_MOBILE_WEB_APP_ENABLED` can disable new traffic without altering extension requests. The app response carries `X-Robots-Tag: noindex, nofollow`; the CSP allows only the same-origin app, configured Supabase browser endpoints, Stripe browser endpoints, `blob:` image previews, and the existing analytics endpoint.
- Consumes the route and client names from Tasks 1 through 5. Acquisition SEO consumes the noindex and sitemap boundaries but owns public landing metadata.

- [ ] **Step 1: Write failing config and extension regression tests.**

```ts
it("disables only mobile web when the flag is false", () => {
  expect(
    isMobileWebEnabled({
      MOBILE_WEB_APP_ENABLED: "false",
    } as NodeJS.ProcessEnv),
  ).toBe(false);
  expect(isMobileWebEnabled({} as NodeJS.ProcessEnv)).toBe(true);
});

it("requires the app noindex and browser CSP header contract", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const headers = vercel.headers.find(
    (entry: any) => entry.source === "/app/(.*)",
  ).headers;
  expect(headers).toContainEqual({
    key: "X-Robots-Tag",
    value: "noindex, nofollow",
  });
  expect(
    headers.find((entry: any) => entry.key === "Content-Security-Policy").value,
  ).toContain("connect-src 'self'");
});
```

- [ ] **Step 2: Run the focused config test to verify it fails.**

Run: `npx vitest run src/api/__tests__/mobileWebConfig.test.ts`

Expected: FAIL because `vercel.json` has no app header rule and the feature flag contract is not tested.

- [ ] **Step 3: Add the additive Vercel header and flag contract.**

Add one `/app/(.*)` header rule with `X-Robots-Tag: noindex, nofollow` and a CSP that uses `default-src 'self'`, `connect-src 'self' https://*.supabase.co https://api.stripe.com`, `img-src 'self' data: blob: https:`, `script-src 'self' 'unsafe-inline' https://js.stripe.com`, and `frame-src https://js.stripe.com https://hooks.stripe.com`. Preserve all existing rewrites and cron entries. Keep the server flag default enabled for backward compatibility, have the app client read the separate public flag, and ensure a disabled flag returns the existing non-mobile route behavior rather than a new error page.

- [ ] **Step 4: Add explicit extension regression cases and run the full production verification suite.**

Run: `npx vitest run src/api/__tests__/mobileWebConfig.test.ts src/api/__tests__/generateMobileWeb.test.ts src/api/__tests__/magicLinkEndpoint.test.ts src/api/__tests__/createCheckoutExistingSubscriber.test.ts src/api/__tests__/stripeWebhookSubscriptionUsageReset.test.ts src/api/__tests__/phoneUpload.test.ts src/api/__tests__/eventsTrack.test.ts src/api/__tests__/attributionClaim.test.ts && npm run verify:production`

Expected: PASS for all focused tests and `npm run verify:production` completes lint, type-check, Astro build, format-check, and the complete Vitest suite. Do not run `npm run push:production` in this task.

- [ ] **Step 5: Commit only backend foundation files.**

```bash
git add vercel.json utils/mobileWeb.ts src/api/__tests__/mobileWebConfig.test.ts src/api/__tests__/generateMobileWeb.test.ts
git commit -m "chore: gate mobile web server rollout"
```

## Handoff and release boundary

The app-client plan may begin only after the interfaces in Tasks 1 through 5 are reviewed and the Task 6 verification suite is green. It must use `/api/user/usage`, V2 phone upload, `/api/generate` with the two mobile headers, and bearer billing exactly as specified here. The acquisition plan may add public routes only after the app-client real-device gates pass. Production Supabase, Stripe, Resend, CSP, CORS, and Vercel values are verified in preview or staging by the release owner; no plan task mutates production.
