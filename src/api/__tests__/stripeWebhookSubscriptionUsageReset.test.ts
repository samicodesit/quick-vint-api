import { beforeEach, describe, expect, it, vi } from "vitest";

type WebhookHandler = (req: any, res: any) => Promise<unknown>;

const constructEventMock = vi.fn();
const retrieveSubscriptionMock = vi.fn();
const retrieveCustomerMock = vi.fn();
const rpcMock = vi.fn();
const reportCriticalEndpointFailureMock = vi.fn();
const sendSubscriptionWelcomeEmailOnceMock = vi.fn();
const updateCalls: Array<{ table: string; values: Record<string, unknown> }> =
  [];
const updateFilterCalls: Array<{
  table: string;
  operator: "eq" | "is";
  column: string;
  value: unknown;
}> = [];
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
  let isUpdate = false;
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn((values: Record<string, unknown>) => {
      isUpdate = true;
      updateCalls.push({ table, values });
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      if (isUpdate) {
        updateFilterCalls.push({
          table,
          operator: "eq",
          column,
          value,
        });
      }
      return builder;
    }),
    is: vi.fn((column: string, value: unknown) => {
      if (isUpdate) {
        updateFilterCalls.push({
          table,
          operator: "is",
          column,
          value,
        });
      }
      return builder;
    }),
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

vi.mock("../../../utils/subscriptionWelcomeEmail", () => ({
  sendSubscriptionWelcomeEmailOnce: sendSubscriptionWelcomeEmailOnceMock,
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
    updateFilterCalls.length = 0;
    selectQueues.clear();
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
    sendSubscriptionWelcomeEmailOnceMock.mockResolvedValue({
      status: "sent",
      resendEmailId: "email_123",
    });
  });

  it("does not reset monthly usage from checkout completion", async () => {
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
    });
    expect(updateCalls[1].values).not.toHaveProperty("last_api_call_reset");
    expect(rpcMock).not.toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.anything(),
    );
    expect(sendSubscriptionWelcomeEmailOnceMock).toHaveBeenCalledWith({
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "starter",
      stripeSubscriptionId: "sub_new",
      stripeCheckoutSessionId: undefined,
    });
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
      stripe_customer_id: "cus_123",
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
    expect(sendSubscriptionWelcomeEmailOnceMock).not.toHaveBeenCalled();
  });

  it("links an email-matched profile when Stripe creates a paid subscription", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_created",
          customer: "cus_123",
          status: "active",
          items: {
            data: [
              {
                price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
                current_period_end: 1784592000,
              },
            ],
          },
        },
      },
    });
    retrieveCustomerMock.mockResolvedValue({
      id: "cus_123",
      email: "seller@example.com",
    });
    queueSelect("profiles", { data: null });
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
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
    expect(updateCalls[0].values).toMatchObject({
      stripe_customer_id: "cus_123",
    });
    expect(sendSubscriptionWelcomeEmailOnceMock).toHaveBeenCalledWith({
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "starter",
      stripeSubscriptionId: "sub_created",
      stripeCheckoutSessionId: undefined,
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
    });
  });

  it.each(["invoice.paid", "invoice.payment_succeeded"])(
    "resets usage through the atomic RPC for a newly paid monthly period from %s",
    async (eventType) => {
      constructEventMock.mockReturnValue({
        id: "evt_paid_renewal",
        type: eventType,
        data: {
          object: {
            id: "in_renewal",
            object: "invoice",
            status: "paid",
            customer: "cus_123",
            billing_reason: "subscription_cycle",
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
        },
      });
      retrieveSubscriptionMock.mockResolvedValue({
        id: "sub_current",
        customer: "cus_123",
        status: "active",
        items: {
          data: [
            {
              price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
              current_period_end: 1788220800,
            },
          ],
        },
      });
      queueSelect("profiles", {
        data: { id: "profile_123", email: "seller@example.com" },
      });
      queueSelect("profiles", {
        data: {
          stripe_subscription_id: "sub_current",
          subscription_status: "past_due",
          subscription_tier: "starter",
          is_legacy_plan: false,
        },
      });
      rpcMock.mockResolvedValueOnce({
        data: { reset: true, reason: "new_paid_period" },
        error: null,
      });

      const webhookModule = await import("../../../api/stripe/webhook.js");
      const handler = webhookModule.default as unknown as WebhookHandler;
      const res = createResponse();

      await handler(createRequest() as any, res as any);

      expect(res.statusCode).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith(
        "reset_monthly_usage_for_paid_invoice",
        {
          p_user_id: "profile_123",
          p_stripe_subscription_id: "sub_current",
          p_stripe_invoice_id: "in_renewal",
          p_period_end: "2026-09-01T00:00:00.000Z",
        },
      );
      expect(updateCalls[0].values).toMatchObject({
        stripe_subscription_id: "sub_current",
        subscription_status: "active",
        subscription_tier: "starter",
        current_period_end: "2026-09-01T00:00:00.000Z",
      });
    },
  );

  it("guards a paid-invoice profile update against a replaced subscription", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_old_paid_invoice",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_old_paid_invoice",
          object: "invoice",
          status: "paid",
          customer: "cus_123",
          billing_reason: "subscription_cycle",
          parent: {
            subscription_details: { subscription: "sub_old" },
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
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_old",
      customer: "cus_123",
      status: "active",
      items: {
        data: [
          {
            price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
            current_period_end: 1788220800,
          },
        ],
      },
    });
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", {
      data: {
        stripe_subscription_id: "sub_replacement",
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: false,
      },
    });
    rpcMock.mockResolvedValueOnce({
      data: { reset: false, reason: "subscription_mismatch" },
      error: null,
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateFilterCalls).toContainEqual({
      table: "profiles",
      operator: "eq",
      column: "stripe_subscription_id",
      value: "sub_old",
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.objectContaining({
        p_stripe_subscription_id: "sub_old",
      }),
    );
  });

  it("never resets usage when a renewal payment fails", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_failed_renewal",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_failed",
          object: "invoice",
          status: "open",
          customer: "cus_123",
          billing_reason: "subscription_cycle",
          parent: {
            subscription_details: { subscription: "sub_current" },
          },
        },
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(rpcMock).not.toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.anything(),
    );
    expect(updateCalls).toHaveLength(0);
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
