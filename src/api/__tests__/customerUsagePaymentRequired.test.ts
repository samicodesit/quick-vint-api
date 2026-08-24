import { beforeEach, describe, expect, it, vi } from "vitest";

const capacityMock = vi.fn();
const profile = {
  id: "user-past-due",
  email: "seller@example.com",
  api_calls_this_month: 508,
  subscription_status: "past_due",
  subscription_tier: "business",
  current_period_end: "2026-08-24T00:00:00.000Z",
  is_legacy_plan: false,
  free_lifetime_generations_used: 5,
  pack_credits: 0,
  custom_daily_limit: 60,
  custom_monthly_limit: 600,
  custom_limit_expires_at: "2099-12-31T23:59:59.000Z",
  custom_limit_reason: "Custom Business setup",
};

vi.mock("../../../utils/customerUsageToken", () => ({
  verifyCustomerUsageToken: vi.fn(() => ({
    email: "seller@example.com",
    expiresAt: "2099-12-31T23:59:59.000Z",
  })),
}));

vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: { getGenerationCapacity: capacityMock },
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        ilike: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: profile, error: null })),
        maybeSingle: vi.fn(async () => ({
          data: table === "rate_limits" ? { count: 0 } : null,
          error: null,
        })),
      };
      return builder;
    }),
  },
}));

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

describe("customer usage payment state", () => {
  beforeEach(() => {
    capacityMock.mockResolvedValue({
      allowed: false,
      available: 0,
      tier: "business",
      reason: "payment_required",
      message: "Payment failed. Update payment to continue.",
      limits: { daily: 60, monthly: 600 },
      remaining: { day: null, month: 92, packCredits: 0 },
    });
  });

  it("labels a delinquent custom plan as payment required instead of active", async () => {
    const usageModule = await import("../../../api/customer/usage.js");
    const handler = usageModule.default as unknown as (
      req: any,
      res: any,
    ) => Promise<unknown>;
    const res = createResponse();

    await handler(
      { method: "GET", query: { token: "valid-token" } } as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.setup.status).toBe("payment_required");
    expect(res.body.usage).toMatchObject({
      allowed: false,
      availableNow: 0,
      reason: "payment_required",
      message: "Payment failed. Update payment to continue.",
    });
  });
});
