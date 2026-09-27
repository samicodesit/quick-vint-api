import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: any, res: any) => Promise<unknown>;

const retrieveSubscriptionMock = vi.fn();
const retrieveCheckoutSessionMock = vi.fn();
const retrieveInvoiceMock = vi.fn();
const sendWelcomeMock = vi.fn();
const fromMock = vi.fn();
let retryRows: Array<Record<string, unknown>> | null = null;
let retryQueryCount = 0;

vi.mock("stripe", () => ({
  default: vi.fn(function (this: any) {
    this.subscriptions = { retrieve: retrieveSubscriptionMock };
    this.checkout = { sessions: { retrieve: retrieveCheckoutSessionMock } };
    this.invoices = { retrieve: retrieveInvoiceMock };
  }),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from: fromMock },
}));

vi.mock("../../../utils/subscriptionWelcomeEmail", () => ({
  sendSubscriptionWelcomeEmailOnce: sendWelcomeMock,
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

function createQuery(table: string) {
  const query: any = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    eq: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => {
      if (table !== "subscription_welcome_emails") {
        return { data: [], error: null };
      }

      const isDueQuery = retryQueryCount++ === 0;
      return {
        data: isDueQuery
          ? (retryRows ?? [
              {
                user_id: "profile_123",
                email: "seller@example.com",
                tier: "business",
                stripe_subscription_id: "sub_123",
                stripe_checkout_session_id: "cs_123",
              },
            ])
          : [],
        error: null,
      };
    }),
    maybeSingle: vi.fn(async () => ({
      data: {
        is_legacy_plan: true,
        custom_daily_limit: 120,
        custom_monthly_limit: 1200,
      },
      error: null,
    })),
  };
  return query;
}

describe("subscription welcome retry", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron_test";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS = "price_custom_business";
    vi.clearAllMocks();
    retryRows = null;
    retryQueryCount = 0;
    fromMock.mockImplementation((table: string) => createQuery(table));
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_123",
      status: "active",
      latest_invoice: "in_123",
      items: {
        data: [
          {
            price: { id: "price_custom_business" },
            current_period_end: 1792368000,
          },
        ],
      },
    });
    retrieveCheckoutSessionMock.mockResolvedValue({
      id: "cs_123",
      amount_total: 3499,
      currency: "usd",
    });
    retrieveInvoiceMock.mockResolvedValue({
      id: "in_123",
      amount_paid: 3499,
      currency: "usd",
    });
    sendWelcomeMock.mockResolvedValue({ status: "sent" });
  });

  it("rehydrates customer-facing billing and entitlements before retrying", async () => {
    const module =
      await import("../../../api/cron/subscription-welcome-retry.js");
    const handler = module.default as unknown as Handler;
    const response = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(sendWelcomeMock).toHaveBeenCalledWith({
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "business",
      stripeSubscriptionId: "sub_123",
      stripeCheckoutSessionId: "cs_123",
      isLegacyPlan: true,
      billing: {
        amountMinor: 3499,
        currency: "usd",
        nextRenewalAt: "2026-10-19T00:00:00.000Z",
        statementDescriptor: "AUTOLISTER AI",
        source: "checkout",
      },
      limits: { daily: 120, monthly: 1200 },
      isCustomPlan: true,
    });
    expect(response.body).toMatchObject({
      ok: true,
      checked: 1,
      results: [{ status: "sent" }],
    });
  });

  it.each([
    ["canceled", { status: "canceled" }, "skipped"],
    [
      "canceling at period end",
      { status: "active", cancel_at_period_end: true },
      "skipped",
    ],
    ["past_due", { status: "past_due" }, "deferred"],
    ["unpaid", { status: "unpaid" }, "deferred"],
    ["incomplete", { status: "incomplete" }, "deferred"],
  ])(
    "does not send a welcome email for a %s subscription",
    async (_label, state, expectedStatus) => {
      retrieveSubscriptionMock.mockResolvedValue({
        id: "sub_123",
        ...state,
        items: {
          data: [
            {
              price: { id: "price_custom_business" },
              current_period_end: 1792368000,
            },
          ],
        },
      });

      const module =
        await import("../../../api/cron/subscription-welcome-retry.js");
      const handler = module.default as unknown as Handler;
      const response = createResponse();

      await handler(
        { headers: { authorization: "Bearer cron_test" } },
        response as any,
      );

      expect(response.statusCode).toBe(200);
      expect(sendWelcomeMock).not.toHaveBeenCalled();
      expect(response.body).toMatchObject({
        ok: true,
        checked: 1,
        results: [{ status: expectedStatus }],
      });
    },
  );

  it("continues retrying other rows when Stripe deleted a subscription or checkout session", async () => {
    retryRows = [
      {
        user_id: "profile_deleted_subscription",
        email: "deleted-subscription@example.com",
        tier: "business",
        stripe_subscription_id: "sub_deleted",
        stripe_checkout_session_id: "cs_deleted",
      },
      {
        user_id: "profile_deleted_session",
        email: "deleted-session@example.com",
        tier: "business",
        stripe_subscription_id: "sub_session_deleted",
        stripe_checkout_session_id: "cs_session_deleted",
      },
      {
        user_id: "profile_valid",
        email: "valid@example.com",
        tier: "business",
        stripe_subscription_id: "sub_valid",
        stripe_checkout_session_id: "cs_valid",
      },
    ];
    retryQueryCount = 0;
    retrieveSubscriptionMock
      .mockRejectedValueOnce({ code: "resource_missing" })
      .mockResolvedValueOnce({
        id: "sub_session_deleted",
        status: "active",
        items: {
          data: [
            {
              price: { id: "price_custom_business" },
              current_period_end: 1792368000,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: "sub_valid",
        status: "active",
        items: {
          data: [
            {
              price: { id: "price_custom_business" },
              current_period_end: 1792368000,
            },
          ],
        },
      });
    retrieveCheckoutSessionMock
      .mockRejectedValueOnce({ code: "resource_missing" })
      .mockResolvedValueOnce({
        id: "cs_valid",
        amount_total: 3499,
        currency: "usd",
      });

    const module =
      await import("../../../api/cron/subscription-welcome-retry.js");
    const handler = module.default as unknown as Handler;
    const response = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(sendWelcomeMock).toHaveBeenCalledTimes(1);
    expect(sendWelcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile_valid",
        stripeSubscriptionId: "sub_valid",
      }),
    );
    expect(response.body).toMatchObject({
      ok: true,
      checked: 3,
      results: [
        { status: "skipped" },
        { status: "skipped" },
        { status: "sent" },
      ],
    });
  });
});
