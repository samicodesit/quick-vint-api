import { beforeEach, describe, expect, it, vi } from "vitest";

type WebhookHandler = (req: any, res: any) => Promise<unknown>;

const constructEventMock = vi.fn();
const retrieveSubscriptionMock = vi.fn();
const retrieveCustomerMock = vi.fn();
const rpcMock = vi.fn();
const reportCriticalEndpointFailureMock = vi.fn();
const updateCalls: Array<{ table: string; values: Record<string, unknown> }> =
  [];
const selectQueues = new Map<
  string,
  Array<{ data: unknown; error?: unknown }>
>();

function queueSelect(
  table: string,
  response: { data: unknown; error?: unknown },
) {
  const queue = selectQueues.get(table) || [];
  queue.push(response);
  selectQueues.set(table, queue);
}

function popSelect(table: string) {
  const queue = selectQueues.get(table) || [];
  const response = queue.shift();
  selectQueues.set(table, queue);

  if (!response) {
    throw new Error(`Unexpected Supabase select for ${table}`);
  }

  return response;
}

function createQueryBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn((values: Record<string, unknown>) => {
      updateCalls.push({ table, values });
      return builder;
    }),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    single: vi.fn(async () => popSelect(table)),
  };

  return builder;
}

vi.mock("stripe", () => {
  function StripeMock(this: any) {
    this.webhooks = {
      constructEvent: constructEventMock,
    };
    this.subscriptions = {
      retrieve: retrieveSubscriptionMock,
    };
    this.customers = {
      retrieve: retrieveCustomerMock,
    };
  }

  return { default: StripeMock };
});

vi.mock("micro", () => ({
  buffer: vi.fn(async () => Buffer.from("{}")),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => createQueryBuilder(table)),
    rpc: rpcMock,
  },
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: reportCriticalEndpointFailureMock,
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    send: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    end: vi.fn((body?: unknown) => {
      res.body = body;
      return res;
    }),
  };

  return res;
}

function createRequest() {
  return {
    method: "POST",
    headers: {
      "stripe-signature": "test-signature",
    },
  };
}

describe("Stripe webhook subscription usage reset", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    delete process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS;
    delete process.env.CUSTOM_BUSINESS_MONTHLY_PRICE_EUR;
    delete process.env.CUSTOM_BUSINESS_DAILY_LIMIT;
    delete process.env.CUSTOM_BUSINESS_MONTHLY_LIMIT;
    updateCalls.length = 0;
    selectQueues.clear();
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("resets monthly usage when checkout completion activates a free user", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_new",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_new",
      status: "active",
      items: {
        data: [
          {
            price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
            current_period_end: 1784592000,
          },
        ],
      },
    });
    queueSelect("profiles", {
      data: {
        id: "profile_123",
        stripe_subscription_id: null,
        subscription_status: "free",
        subscription_tier: "free",
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1].values).toMatchObject({
      stripe_subscription_id: "sub_new",
      stripe_customer_id: "cus_123",
      subscription_tier: "starter",
      subscription_status: "active",
      is_legacy_plan: false,
      account_status: "active",
      abuse_reason: null,
      abuse_notes: null,
      paused_at: null,
      paused_by: null,
      api_calls_this_month: 0,
    });
    expect(updateCalls[1].values.last_api_call_reset).toEqual(
      expect.any(String),
    );
  });

  it("does not reset monthly usage for routine same-subscription updates", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_current",
          customer: "cus_123",
          status: "active",
          items: {
            data: [
              {
                price: { id: "price_1S96o0P5rNq9hGDStClke9za" },
                current_period_end: 1784592000,
              },
            ],
          },
        },
      },
    });
    queueSelect("profiles", { data: { id: "profile_123" } });
    queueSelect("profiles", {
      data: {
        stripe_subscription_id: "sub_current",
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: false,
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toEqual({
      stripe_subscription_id: "sub_current",
      subscription_tier: "pro",
      subscription_status: "active",
      current_period_end: "2026-07-21T00:00:00.000Z",
      is_legacy_plan: false,
      account_status: "active",
      abuse_reason: null,
      abuse_notes: null,
      paused_at: null,
      paused_by: null,
    });
  });

  it("activates custom Business limits from a subscription-level period end", async () => {
    process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS = "price_custom_business";
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_custom",
          customer: "cus_123",
          status: "active",
          current_period_end: 1784592000,
          items: {
            data: [
              {
                price: { id: "price_custom_business" },
              },
            ],
          },
        },
      },
    });
    queueSelect("profiles", { data: { id: "profile_123" } });
    queueSelect("profiles", {
      data: {
        stripe_subscription_id: null,
        subscription_status: "free",
        subscription_tier: "free",
        is_legacy_plan: false,
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
      stripe_subscription_id: "sub_custom",
      subscription_tier: "business",
      subscription_status: "active",
      current_period_end: "2026-07-21T00:00:00.000Z",
      is_legacy_plan: false,
      custom_daily_limit: 100,
      custom_monthly_limit: 1000,
      custom_limit_expires_at: "2026-07-21T00:00:00.000Z",
      custom_limit_reason: "Custom Business setup",
      api_calls_this_month: 0,
    });
  });

  it("clears account pause after a successful credit pack purchase", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_credit_pack",
          mode: "payment",
          payment_status: "paid",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
          metadata: {
            purchase_type: "credit_pack",
            profile_id: "profile_123",
            credits: "20",
            pack_id: "credits_20",
          },
        },
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("grant_credit_pack", {
      p_user_id: "profile_123",
      p_stripe_session_id: "cs_credit_pack",
      p_credits: 20,
      p_metadata: {
        customer_id: "cus_123",
        email: "seller@example.com",
        pack_id: "credits_20",
      },
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({
      table: "profiles",
      values: {
        account_status: "active",
        abuse_reason: null,
        abuse_notes: null,
        paused_at: null,
        paused_by: null,
      },
    });
  });

  it("logs a critical failure when webhook processing fails", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_credit_pack",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_credit_pack",
          mode: "payment",
          payment_status: "paid",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
          metadata: {
            purchase_type: "credit_pack",
            profile_id: "profile_123",
            credits: "20",
            pack_id: "credits_20",
          },
        },
      },
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: new Error("constraint failed"),
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/stripe/webhook",
      status: 500,
      details: {
        eventId: "evt_credit_pack",
        eventType: "checkout.session.completed",
        error: "constraint failed",
        errorName: "Error",
      },
    });
  });
});
