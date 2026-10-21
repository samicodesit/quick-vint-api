import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const singleMock = vi.fn();
const upsertMock = vi.fn();
const getGenerationCapacityMock = vi.fn();
const getGenerationMinuteRemainingMock = vi.fn();

vi.mock("cors", () => ({
  default: vi.fn(
    () => (_req: unknown, _res: unknown, callback: (err?: unknown) => void) =>
      callback(),
  ),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}));

vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: {
    getGenerationCapacity: getGenerationCapacityMock,
    getGenerationMinuteRemaining: getGenerationMinuteRemainingMock,
  },
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    setHeader: vi.fn((name: string, value: unknown) => {
      response.headers[name.toLowerCase()] = value;
      return response;
    }),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
    end: vi.fn(() => response),
  };

  return response;
}

const now = new Date("2026-09-23T12:34:30.000Z");

const freeProfile = {
  id: "user-1",
  api_calls_this_month: 0,
  subscription_status: "free",
  subscription_tier: "free",
  current_period_end: null,
  is_legacy_plan: false,
  free_lifetime_generations_used: 0,
  pack_credits: 0,
  custom_daily_limit: null,
  custom_monthly_limit: null,
  custom_limit_expires_at: null,
  account_status: "active",
  abuse_reason: null,
};

const freeCapacity = {
  allowed: true,
  available: 5,
  tier: "free",
  limits: { daily: null, monthly: 8, freeLifetime: 5, burstPerMinute: 3 },
  remaining: { day: null, month: 8, freeLifetime: 5, packCredits: 0 },
};

function setupProfileQuery(
  data: Record<string, unknown> | null,
  error: { code?: string; message?: string } | null = null,
) {
  selectMock.mockReturnThis();
  eqMock.mockReturnThis();
  singleMock.mockResolvedValue({ data, error });
  upsertMock.mockResolvedValue({ data: null, error: null });
  fromMock.mockReturnValue({
    select: selectMock,
    eq: eqMock,
    single: singleMock,
    upsert: upsertMock,
  });
}

async function loadProjection() {
  return import("../../../utils/userUsage.js");
}

async function invokeHandler(
  profile: Record<string, unknown> | null,
  profileError: { code?: string; message?: string } | null = null,
) {
  setupProfileQuery(profile, profileError);
  const handler = (await import("../../../api/user/usage.js")).default as any;
  const response = createResponse();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer access-token" },
    } as any,
    response as any,
  );
  return response;
}

describe("authenticated mobile usage endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOBILE_WEB_APP_ENABLED = "true";
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    getGenerationCapacityMock.mockResolvedValue(freeCapacity);
    getGenerationMinuteRemainingMock.mockResolvedValue(2);
    setupProfileQuery(freeProfile);
  });

  it("returns the disabled response while the mobile usage rollout is disabled", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";

    const response = await invokeHandler(freeProfile);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Mobile web app unavailable.",
      code: "mobile_web_disabled",
    });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("projects native generation capacity and UTC reset boundaries", async () => {
    const { buildUsageResponse } = await loadProjection();
    const response = buildUsageResponse(freeProfile, freeCapacity, 3, now);

    expect(response).toMatchObject({
      plan: { tier: "free", status: "free", isPaid: false },
      limits: {
        freeLifetime: 5,
        daily: null,
        monthly: null,
        burstPerMinute: 3,
        packCredits: 0,
      },
      remaining: {
        generations: 5,
        freeLifetime: 5,
        daily: null,
        monthly: null,
        minute: 3,
        packCredits: 0,
      },
      resetsAt: {
        minute: "2026-09-23T12:35:00.000Z",
        daily: null,
        monthly: null,
        subscriptionPeriodEnd: null,
      },
      pricing: {
        currency: "EUR",
        tiers: {
          starter: { monthly: 3.99 },
          pro: { monthly: 9.99 },
          business: { monthly: 19.99 },
        },
        creditPack: { credits: 20, price: 5.99 },
        creditPacks: [
          { id: "credits_20", credits: 20, price: 5.99 },
          { id: "credits_50", credits: 50, price: 9.99 },
          { id: "credits_100", credits: 100, price: 16.99 },
        ],
      },
    });
    expect(JSON.stringify(response)).not.toContain("stripe_customer_id");
  });

  it("exposes the authoritative denial reason without turning burst limits into trial exhaustion", async () => {
    const { buildUsageResponse } = await loadProjection();
    expect(
      buildUsageResponse(
        freeProfile,
        {
          ...freeCapacity,
          allowed: false,
          available: 0,
          reason: "burst_limit",
          nextTier: "starter",
        },
        0,
        now,
      ),
    ).toMatchObject({
      blockedReason: "burst_limit",
      nextTier: "starter",
      canGenerate: false,
    });
    expect(
      buildUsageResponse(
        { ...freeProfile, account_status: "paused" },
        freeCapacity,
        3,
        now,
      ),
    ).toMatchObject({ blockedReason: "account_paused", canGenerate: false });
  });

  it("maps paused, inactive, and payment-required account states", async () => {
    const { buildUsageResponse } = await loadProjection();
    const paidProfile = {
      ...freeProfile,
      subscription_status: "active",
      subscription_tier: "pro",
      current_period_end: "2026-10-01T00:00:00.000Z",
      account_status: "active",
    };
    const paidCapacity = {
      ...freeCapacity,
      allowed: true,
      available: 10,
      tier: "pro",
      limits: { daily: 10, monthly: 50, burstPerMinute: 20 },
      remaining: { day: 4, month: 40, packCredits: 0 },
    };

    expect(
      buildUsageResponse(
        { ...freeProfile, account_status: "paused" },
        { ...freeCapacity, allowed: false },
        3,
        now,
      ),
    ).toMatchObject({
      plan: { status: "paused" },
      canGenerate: false,
    });

    expect(
      buildUsageResponse(
        { ...paidProfile, account_status: "inactive" },
        paidCapacity,
        20,
        now,
      ),
    ).toMatchObject({
      plan: { status: "inactive", tier: "pro", isPaid: true },
      canGenerate: false,
    });

    expect(
      buildUsageResponse(
        { ...paidProfile, subscription_status: "past_due" },
        {
          ...paidCapacity,
          allowed: false,
          reason: "payment_required",
          message: "Payment failed. Update payment to continue.",
        },
        20,
        now,
      ),
    ).toMatchObject({
      plan: { status: "payment_required", tier: "pro", isPaid: true },
      canGenerate: false,
    });
  });

  it("returns a read-only 404 for a missing profile and never upserts", async () => {
    const response = await invokeHandler(null, { code: "PGRST116" });

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Usage account was not found.",
      code: "profile_not_found",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("uses the public minute fallback only when capacity omits minute", async () => {
    getGenerationCapacityMock.mockResolvedValue({
      ...freeCapacity,
      limits: { daily: 10, monthly: 50, burstPerMinute: 3 },
      remaining: { day: 4, month: 40, packCredits: 0 },
    });
    getGenerationMinuteRemainingMock.mockResolvedValue(2);

    const response = await invokeHandler(freeProfile);

    expect(response.statusCode).toBe(200);
    expect((response.body as any).remaining.minute).toBe(2);
    expect(getGenerationMinuteRemainingMock).toHaveBeenCalledWith("user-1", 3);
  });

  it("reports null minute remaining when the fallback read fails", async () => {
    getGenerationCapacityMock.mockResolvedValue({
      ...freeCapacity,
      limits: { daily: 10, monthly: 50, burstPerMinute: 3 },
      remaining: { day: 4, month: 40, packCredits: 0 },
    });
    getGenerationMinuteRemainingMock.mockResolvedValue(null);

    const response = await invokeHandler(freeProfile);

    expect(response.statusCode).toBe(200);
    expect((response.body as any).remaining.minute).toBeNull();
  });

  it("preserves a null minute read instead of guessing the full burst", async () => {
    getGenerationCapacityMock.mockResolvedValue({
      ...freeCapacity,
      remaining: { ...freeCapacity.remaining, minute: null },
    });

    const response = await invokeHandler(freeProfile);

    expect(response.statusCode).toBe(200);
    expect((response.body as any).remaining.minute).toBeNull();
    expect(getGenerationMinuteRemainingMock).not.toHaveBeenCalled();
  });

  it("fails closed when account status is missing", async () => {
    const { buildUsageResponse } = await loadProjection();

    expect(
      buildUsageResponse(
        { ...freeProfile, account_status: null },
        freeCapacity,
        2,
        now,
      ),
    ).toMatchObject({
      plan: { status: "inactive" },
      canGenerate: false,
    });
  });

  it("uses a capacity minute value without a second limiter read", async () => {
    getGenerationCapacityMock.mockResolvedValue({
      ...freeCapacity,
      remaining: { ...freeCapacity.remaining, minute: 1 },
    });

    const response = await invokeHandler(freeProfile);

    expect(response.statusCode).toBe(200);
    expect((response.body as any).remaining.minute).toBe(1);
    expect(getGenerationMinuteRemainingMock).not.toHaveBeenCalled();
  });

  it("uses UTC day and month boundaries for applicable paid limits", async () => {
    const { getUtcResetBoundary } = await loadProjection();

    expect(
      getUtcResetBoundary(new Date("2026-09-30T23:59:30.000Z"), "day"),
    ).toBe("2026-10-01T00:00:00.000Z");
    expect(
      getUtcResetBoundary(new Date("2026-09-30T23:59:30.000Z"), "month"),
    ).toBe("2026-10-01T00:00:00.000Z");

    const { buildUsageResponse } = await loadProjection();
    const paidProfile = {
      ...freeProfile,
      subscription_status: "active",
      subscription_tier: "pro",
      current_period_end: "2026-10-01T00:00:00.000Z",
    };
    const paidCapacity = {
      ...freeCapacity,
      tier: "pro",
      limits: { daily: 10, monthly: 50, burstPerMinute: 20 },
      remaining: { day: 4, month: 40, packCredits: 0, minute: 20 },
    };

    expect(
      buildUsageResponse(paidProfile, paidCapacity, 20, now).resetsAt,
    ).toEqual({
      minute: "2026-09-23T12:35:00.000Z",
      daily: "2026-09-24T00:00:00.000Z",
      monthly: "2026-10-01T00:00:00.000Z",
      subscriptionPeriodEnd: "2026-10-01T00:00:00.000Z",
    });
  });

  it("sets private no-store caching and rejects non-GET requests", async () => {
    const handler = (await import("../../../api/user/usage.js")).default as any;
    const response = createResponse();

    await handler({ method: "POST", headers: {} } as any, response as any);

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe("GET");
    expect(response.body).toEqual({ error: "Method Not Allowed" });

    const getResponse = await invokeHandler(freeProfile);
    expect(getResponse.headers["cache-control"]).toBe("private, no-store");
  });
});
