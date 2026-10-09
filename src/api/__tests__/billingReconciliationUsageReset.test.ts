import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: any, res: any) => Promise<unknown>;

const subscriptionsListMock = vi.fn();
const invoicesListMock = vi.fn();
const rpcMock = vi.fn();
const profileFilterMock = vi.fn();
const reportCriticalEndpointFailureMock = vi.fn();
let profileStatus = "active";
let profileQueryError: { message: string } | null = null;

vi.mock("stripe", () => {
  function StripeMock(this: any) {
    this.subscriptions = { list: subscriptionsListMock };
    this.invoices = { list: invoicesListMock };
  }

  return { default: StripeMock };
});

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        const query = {
          select: vi.fn(() => query),
          or: profileFilterMock.mockImplementation(() => query),
          limit: vi.fn(async () => ({
            data: profileQueryError
              ? null
              : [
                  {
                    id: "profile_123",
                    email: "seller@example.com",
                    subscription_status: profileStatus,
                    subscription_tier: "starter",
                    stripe_customer_id: "cus_123",
                    stripe_subscription_id: "sub_current",
                  },
                ],
            error: profileQueryError,
          })),
        };
        return query;
      }

      return {
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
    rpc: rpcMock,
  },
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: reportCriticalEndpointFailureMock,
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as any,
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

describe("billing reconciliation usage reset", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.CRON_SECRET = "cron_test";
    profileStatus = "active";
    profileQueryError = null;
    vi.clearAllMocks();
    subscriptionsListMock.mockResolvedValue({
      data: [
        {
          id: "sub_current",
          status: "active",
          cancel_at_period_end: false,
        },
      ],
    });
    invoicesListMock.mockResolvedValue({
      data: [
        {
          id: "in_latest_paid",
          status: "paid",
          amount_remaining: 0,
          currency: "eur",
          parent: {
            subscription_details: { subscription: "sub_current" },
          },
          lines: {
            data: [
              {
                parent: {
                  subscription_item_details: { proration: false },
                },
                period: { start: 1785542400, end: 1788220800 },
              },
            ],
          },
        },
      ],
    });
    rpcMock.mockResolvedValue({
      data: { reset: true, reason: "new_paid_period" },
      error: null,
    });
  });

  it("heals a missed paid-period webhook through the same atomic RPC", async () => {
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      {
        p_user_id: "profile_123",
        p_stripe_subscription_id: "sub_current",
        p_stripe_invoice_id: "in_latest_paid",
        p_period_end: "2026-09-01T00:00:00.000Z",
      },
    );
    expect(res.body).toMatchObject({
      ok: true,
      checked: 1,
      usageResets: 1,
      usageResetErrors: 0,
    });
    expect(profileFilterMock).toHaveBeenCalledWith(
      "stripe_customer_id.not.is.null,subscription_tier.neq.free,subscription_status.in.(active,trialing,past_due,unpaid,canceling)",
    );
    expect(reportCriticalEndpointFailureMock).not.toHaveBeenCalled();
  });

  it("does not replay an older paid invoice while the current renewal is past due", async () => {
    profileStatus = "past_due";
    subscriptionsListMock.mockResolvedValue({
      data: [
        {
          id: "sub_current",
          status: "past_due",
          cancel_at_period_end: false,
        },
      ],
    });
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      ok: true,
      usageResets: 0,
      usageResetErrors: 0,
    });
  });

  it("repairs a recovered past-due profile when Stripe is active", async () => {
    profileStatus = "past_due";
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.objectContaining({ p_stripe_subscription_id: "sub_current" }),
    );
  });

  it("skips newer paid invoices for a replaced subscription", async () => {
    invoicesListMock.mockResolvedValue({
      data: [
        {
          id: "in_old_subscription",
          status: "paid",
          parent: {
            subscription_details: { subscription: "sub_old" },
          },
          lines: {
            data: [
              {
                parent: {
                  subscription_item_details: { proration: false },
                },
                period: { start: 1788220800, end: 1790812800 },
              },
            ],
          },
        },
        {
          id: "in_current_subscription",
          status: "paid",
          parent: {
            subscription_details: { subscription: "sub_current" },
          },
          lines: {
            data: [
              {
                parent: {
                  subscription_item_details: { proration: false },
                },
                period: { start: 1785542400, end: 1788220800 },
              },
            ],
          },
        },
      ],
    });
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.objectContaining({
        p_stripe_subscription_id: "sub_current",
        p_stripe_invoice_id: "in_current_subscription",
      }),
    );
  });

  it("returns 500 when a usage repair fails so the failure stays visible", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      usageResetErrors: 1,
    });
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledTimes(1);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/cron/billing-reconciliation",
      status: 500,
      details: expect.objectContaining({
        checked: 1,
        mismatches: 0,
        usageResetErrors: 1,
      }),
    });
  });

  it("sends one aggregated alert for billing drift", async () => {
    subscriptionsListMock.mockResolvedValue({ data: [] });
    invoicesListMock.mockResolvedValue({ data: [] });
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledTimes(1);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/cron/billing-reconciliation",
      status: 409,
      details: {
        checked: 1,
        mismatches: 1,
        usageResetErrors: 0,
        reasonCounts: {
          paid_profile_without_active_stripe_subscription: 1,
        },
        sampleUserIds: ["profile_123"],
      },
    });
  });

  it("alerts and stops when Stripe reconciliation fails", async () => {
    subscriptionsListMock.mockRejectedValue(new Error("stripe unavailable"));
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(500);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledTimes(1);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/cron/billing-reconciliation",
      status: 500,
      userId: "profile_123",
      details: {
        stage: "stripe_snapshot",
      },
    });
  });

  it("alerts when the profile query fails", async () => {
    profileQueryError = { message: "database unavailable" };
    const module = await import("../../../api/cron/billing-reconciliation.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(500);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledTimes(1);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/cron/billing-reconciliation",
      status: 500,
      details: {
        stage: "profile_query",
      },
    });
  });
});
