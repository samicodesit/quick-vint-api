import { beforeEach, describe, expect, it, vi } from "vitest";

type WebhookHandler = (req: any, res: any) => Promise<unknown>;

const constructEventMock = vi.fn();
const retrieveSubscriptionMock = vi.fn();
const retrieveCustomerMock = vi.fn();
const retrieveInvoiceMock = vi.fn();
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
const singleCalls: string[] = [];
const maybeSingleCalls: string[] = [];
let interleavedProfile: Record<string, unknown> | null = null;
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
  let valuesToWrite: Record<string, unknown> = {};
  const predicates: Array<[string, unknown]> = [];
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn((values: Record<string, unknown>) => {
      isUpdate = true;
      valuesToWrite = values;
      updateCalls.push({ table, values });
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      if (isUpdate) {
        predicates.push([column, value]);
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
        predicates.push([column, value]);
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
    single: vi.fn(async () => {
      singleCalls.push(table);
      return popSelect(table);
    }),
    maybeSingle: vi.fn(async () => {
      if (isUpdate) {
        const matches =
          !interleavedProfile ||
          predicates.every(
            ([column, value]) =>
              (interleavedProfile![column] ?? null) === value,
          );
        if (matches && interleavedProfile)
          Object.assign(interleavedProfile, valuesToWrite);
        return { data: matches ? { id: "profile_123" } : null, error: null };
      }
      maybeSingleCalls.push(table);
      return popSelect(table);
    }),
    then: (resolve: any, reject: any) => {
      if (
        isUpdate &&
        table === "profiles" &&
        interleavedProfile &&
        predicates.every(
          ([column, value]) => interleavedProfile![column] === value,
        )
      ) {
        Object.assign(interleavedProfile, valuesToWrite);
      }
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
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
    this.invoices = {
      retrieve: retrieveInvoiceMock,
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
    singleCalls.length = 0;
    maybeSingleCalls.length = 0;
    selectQueues.clear();
    interleavedProfile = null;
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
    sendSubscriptionWelcomeEmailOnceMock.mockResolvedValue({
      status: "sent",
      resendEmailId: "email_123",
    });
  });

  it("does not overwrite a same-tier renewal that settles while the upgrade invoice is being read", async () => {
    const end = Math.floor(Date.now() / 1000) + 86400;
    const nextEnd = new Date((end + 30 * 86400) * 1000).toISOString();
    const snapshot = {
      id: "profile_123",
      stripe_subscription_id: "sub_current",
      stripe_customer_id: "cus_123",
      subscription_status: "active",
      subscription_tier: "pro",
      is_legacy_plan: true,
      current_period_end: new Date(end * 1000).toISOString(),
      last_usage_period_end: new Date(end * 1000).toISOString(),
      paid_access_expires_at: null,
    };
    interleavedProfile = { ...snapshot };
    const subscription = {
      id: "sub_current",
      customer: "cus_123",
      status: "past_due",
      latest_invoice: "in_upgrade",
      items: {
        data: [
          {
            price: { id: "price_1S96oFP5rNq9hGDSPZ1RpKHJ" },
            current_period_end: end,
          },
        ],
      },
    };
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    retrieveSubscriptionMock.mockResolvedValue(subscription);
    retrieveInvoiceMock.mockImplementationOnce(async () => {
      Object.assign(interleavedProfile!, {
        current_period_end: nextEnd,
        last_usage_period_end: nextEnd,
      });
      return {
        id: "in_upgrade",
        status: "open",
        billing_reason: "subscription_update",
        subscription: "sub_current",
        customer: "cus_123",
      };
    });
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", { data: { ...snapshot } });
    const { default: handler } = await import("../../../api/stripe/webhook.js");
    const res = createResponse();
    await (handler as any)(createRequest(), res);
    expect(res.statusCode).toBe(409);
    expect(reportCriticalEndpointFailureMock).not.toHaveBeenCalled();
    expect(interleavedProfile).toEqual({
      ...snapshot,
      current_period_end: nextEnd,
      last_usage_period_end: nextEnd,
    });
  });

  it("retries a paid notification instead of clearing a newer unpaid-upgrade protection", async () => {
    const end = Math.floor(Date.now() / 1000) + 86400;
    const date = new Date(end * 1000).toISOString();
    const snapshot = {
      id: "profile_123",
      stripe_subscription_id: "sub_current",
      stripe_customer_id: "cus_123",
      subscription_tier: "pro",
      subscription_status: "active",
      is_legacy_plan: false,
      current_period_end: date,
      last_usage_period_end: date,
      paid_access_expires_at: null,
    };
    interleavedProfile = { ...snapshot };
    const invoice = {
      id: "in_paid",
      status: "paid",
      subscription: "sub_current",
      customer: "cus_123",
      billing_reason: "subscription_cycle",
      lines: {
        data: [
          {
            type: "subscription",
            proration: false,
            period: { start: end - 30 * 86400, end },
          },
        ],
      },
    };
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: invoice },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_current",
      customer: "cus_123",
      status: "active",
      latest_invoice: "in_paid",
      items: {
        data: [
          {
            price: { id: "price_1S96o0P5rNq9hGDStClke9za" },
            current_period_end: end,
          },
        ],
      },
    });
    retrieveInvoiceMock.mockImplementationOnce(async () => {
      interleavedProfile!.paid_access_expires_at = date;
      return invoice;
    });
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", { data: { ...snapshot } });
    const { default: handler } = await import("../../../api/stripe/webhook.js");
    const res = createResponse();
    await (handler as any)(createRequest(), res);
    expect(res.statusCode).toBe(409);
    expect(interleavedProfile).toEqual({
      ...snapshot,
      paid_access_expires_at: date,
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(reportCriticalEndpointFailureMock).not.toHaveBeenCalled();
  });

  it.each(["active", "past_due"])(
    "keeps the paid Pro period when an upgrade invoice is unpaid and Stripe is %s",
    async (stripeStatus) => {
      const end = Math.floor(Date.now() / 1000) + 86400;
      const subscription = {
        id: "sub_current",
        customer: "cus_123",
        status: stripeStatus,
        latest_invoice: "in_upgrade",
        items: {
          data: [
            {
              price: { id: "price_1S96oFP5rNq9hGDSPZ1RpKHJ" },
              current_period_end: end,
            },
          ],
        },
      };
      constructEventMock.mockReturnValue({
        type: "customer.subscription.updated",
        data: { object: subscription },
      });
      retrieveSubscriptionMock.mockResolvedValue(subscription);
      retrieveInvoiceMock.mockResolvedValue({
        id: "in_upgrade",
        status: "open",
        billing_reason: "subscription_update",
        subscription: "sub_current",
        customer: "cus_123",
      });
      queueSelect("profiles", {
        data: { id: "profile_123", email: "seller@example.com" },
      });
      queueSelect("profiles", {
        data: {
          stripe_subscription_id: "sub_current",
          stripe_customer_id: "cus_123",
          subscription_status: "active",
          subscription_tier: "pro",
          is_legacy_plan: true,
          current_period_end: new Date(end * 1000).toISOString(),
          last_usage_period_end: new Date(end * 1000).toISOString(),
        },
      });
      const { default: handler } =
        await import("../../../api/stripe/webhook.js");
      const res = createResponse();
      await (handler as any)(createRequest(), res);
      expect(res.statusCode).toBe(200);
      expect(updateCalls.at(-1)?.values).toMatchObject({
        subscription_tier: "pro",
        subscription_status: "active",
        is_legacy_plan: true,
      });
      expect(updateCalls.at(-1)?.values).not.toHaveProperty(
        "api_calls_this_month",
      );
      expect(updateCalls.at(-1)?.values).not.toHaveProperty("account_status");
      expect(rpcMock).not.toHaveBeenCalled();
      expect(updateFilterCalls).toContainEqual({
        table: "profiles",
        operator: "eq",
        column: "last_usage_period_end",
        value: new Date(end * 1000).toISOString(),
      });
    },
  );

  it("applies the current upgrade after a zero-due paid proration invoice, without resetting usage", async () => {
    const end = Math.floor(Date.now() / 1000) + 86400;
    const invoice = {
      id: "in_upgrade",
      status: "paid",
      billing_reason: "subscription_update",
      amount_paid: 0,
      subscription: "sub_current",
      customer: "cus_123",
      lines: {
        data: [
          {
            type: "subscription",
            proration: true,
            period: { start: end - 3600, end },
          },
        ],
      },
    };
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: invoice },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_current",
      customer: "cus_123",
      status: "active",
      latest_invoice: "in_upgrade",
      items: {
        data: [
          {
            price: { id: "price_1S96oFP5rNq9hGDSPZ1RpKHJ" },
            current_period_end: end,
          },
        ],
      },
    });
    retrieveInvoiceMock.mockResolvedValue(invoice);
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", {
      data: {
        stripe_subscription_id: "sub_current",
        stripe_customer_id: "cus_123",
        subscription_status: "active",
        subscription_tier: "pro",
        is_legacy_plan: false,
      },
    });
    const { default: handler } = await import("../../../api/stripe/webhook.js");
    const res = createResponse();
    await (handler as any)(createRequest(), res);
    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values.subscription_tier).toBe("business");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not reset monthly usage from checkout completion", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          payment_status: "paid",
          subscription: "sub_new",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
          amount_total: 399,
          currency: "eur",
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_new",
      status: "active",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
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
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
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
    expect(updateCalls[0].values).not.toHaveProperty("last_api_call_reset");
    expect(updateFilterCalls).toContainEqual({
      table: "profiles",
      operator: "is",
      column: "stripe_subscription_id",
      value: null,
    });
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
      isLegacyPlan: false,
      billing: {
        amountMinor: 399,
        currency: "eur",
        nextRenewalAt: "2026-07-21T00:00:00.000Z",
        statementDescriptor: "AUTOLISTER AI",
        source: "checkout",
      },
      limits: null,
      isCustomPlan: false,
    });
  });

  it("retries when Stripe changed before the profile snapshot was captured", async () => {
    const end = Math.floor(Date.now() / 1000) + 86400;
    const date = new Date(end * 1000).toISOString();
    interleavedProfile = {
      id: "profile_123",
      stripe_subscription_id: "sub_current",
      stripe_customer_id: "cus_123",
      subscription_tier: "pro",
      subscription_status: "active",
      is_legacy_plan: false,
      current_period_end: date,
      last_usage_period_end: date,
      paid_access_expires_at: null,
    };
    const invoice = {
      id: "in_paid",
      status: "paid",
      subscription: "sub_current",
      customer: "cus_123",
      billing_reason: "subscription_cycle",
      lines: {
        data: [
          {
            type: "subscription",
            proration: false,
            period: { start: end - 30 * 86400, end },
          },
        ],
      },
    };
    const oldStripe = {
      id: "sub_current",
      customer: "cus_123",
      status: "active",
      latest_invoice: "in_paid",
      items: {
        data: [
          {
            price: { id: "price_1S96o0P5rNq9hGDStClke9za" },
            current_period_end: end,
          },
        ],
      },
    };
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: invoice },
    });
    retrieveSubscriptionMock
      .mockImplementationOnce(async () => {
        interleavedProfile!.paid_access_expires_at = date;
        return oldStripe;
      })
      .mockResolvedValue({ ...oldStripe, latest_invoice: "in_unpaid_upgrade" });
    retrieveInvoiceMock.mockResolvedValue(invoice);
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", { data: interleavedProfile });
    const { default: handler } = await import("../../../api/stripe/webhook.js");
    const res = createResponse();
    await (handler as any)(createRequest(), res);
    expect(res.statusCode).toBe(409);
    expect(interleavedProfile!.paid_access_expires_at).toBe(date);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("honours a paid base renewal even when a newer upgrade is still unpaid", async () => {
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    const invoice = {
      id: "in_base",
      status: "paid",
      billing_reason: "subscription_cycle",
      subscription: "sub_current",
      customer: "cus_123",
      lines: {
        data: [
          {
            type: "subscription",
            proration: false,
            price: { id: "price_1S96o0P5rNq9hGDStClke9za" },
            period: { start: end - 30 * 86400, end },
          },
        ],
      },
    };
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: invoice },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_current",
      customer: "cus_123",
      status: "past_due",
      latest_invoice: "in_newer_upgrade",
      items: {
        data: [
          {
            price: { id: "price_1S96oFP5rNq9hGDSPZ1RpKHJ" },
            current_period_end: end,
          },
        ],
      },
    });
    retrieveInvoiceMock.mockResolvedValue({
      id: "in_newer_upgrade",
      status: "open",
      billing_reason: "subscription_update",
      subscription: "sub_current",
      customer: "cus_123",
    });
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", {
      data: {
        stripe_subscription_id: "sub_current",
        stripe_customer_id: "cus_123",
        subscription_status: "past_due",
        subscription_tier: "pro",
        is_legacy_plan: false,
        current_period_end: "2026-01-01T00:00:00Z",
        last_usage_period_end: "2026-01-01T00:00:00Z",
      },
    });
    const { default: handler } = await import("../../../api/stripe/webhook.js");
    const res = createResponse();
    await (handler as any)(createRequest(), res);
    expect(res.statusCode).toBe(200);
    expect(updateCalls[0].values).toMatchObject({
      subscription_tier: "pro",
      subscription_status: "active",
      current_period_end: new Date(end * 1000).toISOString(),
      paid_access_expires_at: new Date(end * 1000).toISOString(),
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.objectContaining({ p_stripe_invoice_id: "in_base" }),
    );
  });

  it("does not send a welcome email for an unpaid async checkout", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          payment_status: "unpaid",
          subscription: "sub_pending",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
          amount_total: 399,
          currency: "eur",
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_pending",
      status: "active",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
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
    expect(updateCalls).toHaveLength(1);
    expect(sendSubscriptionWelcomeEmailOnceMock).not.toHaveBeenCalled();
  });

  it("does not welcome a subscription already set to cancel at period end", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          payment_status: "paid",
          subscription: "sub_canceling",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
          amount_total: 399,
          currency: "eur",
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_canceling",
      status: "active",
      cancel_at_period_end: true,
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
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
    expect(updateCalls).toHaveLength(1);
    expect(sendSubscriptionWelcomeEmailOnceMock).not.toHaveBeenCalled();
  });

  it("accepts subscription checkout when no profile matches the email", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_new",
          customer: "cus_123",
          customer_details: { email: "missing@example.com" },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_new",
      status: "active",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
            current_period_end: 1784592000,
          },
        ],
      },
    });
    queueSelect("profiles", { data: null, error: null });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(maybeSingleCalls).toContain("profiles");
    expect(singleCalls).not.toContain("profiles");
    expect(updateCalls).toHaveLength(0);
  });

  it("preserves legacy limits when subscription checkout is re-delivered", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_legacy",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_legacy",
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
        stripe_subscription_id: "sub_legacy",
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: true,
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls[0].values).toMatchObject({
      stripe_subscription_id: "sub_legacy",
      is_legacy_plan: true,
    });
  });

  it.each([
    ["cus_123", 1],
    ["cus_other", 0],
  ])(
    "only replaces a missing stored subscription for the same customer (%s)",
    async (storedCustomerId, expectedUpdates) => {
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
      retrieveSubscriptionMock.mockResolvedValueOnce({
        id: "sub_new",
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
      });
      retrieveSubscriptionMock.mockRejectedValueOnce({
        code: "resource_missing",
      });
      queueSelect("profiles", {
        data: {
          id: "profile_123",
          stripe_subscription_id: "sub_missing",
          stripe_customer_id: storedCustomerId,
          subscription_status: "canceled",
          subscription_tier: "free",
          is_legacy_plan: false,
        },
      });

      const webhookModule = await import("../../../api/stripe/webhook.js");
      const handler = webhookModule.default as unknown as WebhookHandler;
      const res = createResponse();

      await handler(createRequest() as any, res as any);

      expect(res.statusCode).toBe(200);
      expect(updateCalls).toHaveLength(expectedUpdates);
    },
  );

  it("ignores a delayed checkout for a replaced subscription", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_old",
          customer: "cus_123",
          customer_details: { email: "seller@example.com" },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_old",
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
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_current",
      status: "active",
    });
    queueSelect("profiles", {
      data: {
        id: "profile_123",
        stripe_subscription_id: "sub_current",
        subscription_status: "active",
        subscription_tier: "starter",
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(0);
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
    retrieveSubscriptionMock.mockResolvedValue({
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

  it("ignores an update for a replaced subscription", async () => {
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_old",
      customer: "cus_123",
      status: "canceled",
      items: {
        data: [
          {
            price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
            current_period_end: 1784592000,
          },
        ],
      },
    });
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_replacement",
      customer: "cus_123",
      status: "active",
    });
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_old",
          customer: "cus_123",
          status: "active",
          items: {
            data: [
              {
                price: {
                  id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
                  unit_amount: 399,
                  currency: "eur",
                },
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
        stripe_subscription_id: "sub_replacement",
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
    expect(updateCalls).toHaveLength(0);
  });

  it("uses live Stripe state instead of a stale same-subscription snapshot", async () => {
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
                price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
                current_period_end: 1784592000,
              },
            ],
          },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_current",
      customer: "cus_123",
      status: "unpaid",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
            current_period_end: 1784592000,
          },
        ],
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
    expect(updateCalls[0].values).toMatchObject({
      stripe_subscription_id: "sub_current",
      subscription_status: "unpaid",
      subscription_tier: "starter",
    });
  });

  it("returns 500 when a profile lookup fails so Stripe retries", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_profile_lookup_error",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_current",
          customer: "cus_123",
          status: "active",
          items: { data: [] },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_current",
      customer: "cus_123",
      status: "active",
      items: { data: [] },
    });
    queueSelect("profiles", {
      data: null,
      error: { code: "XX000", message: "database unavailable" },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(updateCalls).toHaveLength(0);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalled();
  });

  it("guards deletion against a replaced subscription", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_old",
          customer: "cus_123",
          status: "canceled",
          items: { data: [] },
        },
      },
    });
    queueSelect("profiles", { data: { id: "profile_123" } });

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
    expect(updateCalls[0].values).not.toHaveProperty("custom_daily_limit");
    expect(updateCalls[0].values).not.toHaveProperty("custom_monthly_limit");
    expect(updateCalls[0].values.paid_access_expires_at).toBeNull();
  });

  it("links an email-matched profile without sending before Checkout completes", async () => {
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
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_created",
      customer: "cus_123",
      status: "active",
      latest_invoice: "in_created",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
            current_period_end: 1784592000,
          },
        ],
      },
    });
    retrieveInvoiceMock.mockResolvedValue({
      id: "in_created",
      amount_paid: 399,
      currency: "eur",
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
    expect(sendSubscriptionWelcomeEmailOnceMock).not.toHaveBeenCalled();
  });

  it("defers the early subscription event until customer-facing billing exists", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_early",
          customer: "cus_123",
          status: "active",
          items: {
            data: [
              {
                price: {
                  id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
                  unit_amount: 399,
                  currency: "eur",
                },
                current_period_end: 1784592000,
              },
            ],
          },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_early",
      customer: "cus_123",
      status: "active",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
            current_period_end: 1784592000,
          },
        ],
      },
    });
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
    expect(sendSubscriptionWelcomeEmailOnceMock).not.toHaveBeenCalled();
  });

  it("waits for Checkout currency when an earlier invoice has another currency", async () => {
    constructEventMock
      .mockReturnValueOnce({
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_race",
            customer: "cus_123",
            status: "active",
            items: {
              data: [
                {
                  price: {
                    id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
                    unit_amount: 399,
                    currency: "eur",
                  },
                  current_period_end: 1784592000,
                },
              ],
            },
          },
        },
      })
      .mockReturnValueOnce({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_race",
            mode: "subscription",
            payment_status: "paid",
            subscription: "sub_race",
            customer: "cus_123",
            customer_details: { email: "seller@example.com" },
            amount_total: 1999,
            currency: "usd",
          },
        },
      });
    const subscription = {
      id: "sub_race",
      customer: "cus_123",
      status: "active",
      latest_invoice: "in_race",
      items: {
        data: [
          {
            price: {
              id: "price_1S96n6P5rNq9hGDSjEHrJV5g",
              unit_amount: 399,
              currency: "eur",
            },
            current_period_end: 1784592000,
          },
        ],
      },
    };
    retrieveSubscriptionMock.mockResolvedValue(subscription);
    retrieveInvoiceMock.mockResolvedValue({
      id: "in_race",
      amount_paid: 399,
      currency: "eur",
    });
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
    queueSelect("profiles", {
      data: {
        id: "profile_123",
        stripe_subscription_id: "sub_race",
        stripe_customer_id: "cus_123",
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: false,
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;

    const firstResponse = createResponse();
    await handler(createRequest() as any, firstResponse as any);
    expect(firstResponse.statusCode).toBe(200);
    expect(sendSubscriptionWelcomeEmailOnceMock).not.toHaveBeenCalled();

    const secondResponse = createResponse();
    await handler(createRequest() as any, secondResponse as any);

    expect(secondResponse.statusCode).toBe(200);
    expect(sendSubscriptionWelcomeEmailOnceMock).toHaveBeenCalledTimes(1);
    expect(sendSubscriptionWelcomeEmailOnceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_race",
        stripeCheckoutSessionId: "cs_race",
        billing: expect.objectContaining({
          amountMinor: 1999,
          currency: "usd",
          source: "checkout",
        }),
      }),
    );
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
    retrieveSubscriptionMock.mockResolvedValue({
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
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_old",
      customer: "cus_123",
      status: "canceled",
      items: {
        data: [
          {
            price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
            current_period_end: 1788220800,
          },
        ],
      },
    });
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_replacement",
      status: "active",
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
    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("ignores a delayed paid invoice from an older subscription period", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_old_paid_period",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_old_paid_period",
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
                period: { start: 1782864000, end: 1785542400 },
              },
            ],
          },
        },
      },
    });
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_current",
      customer: "cus_123",
      status: "past_due",
      items: {
        data: [
          {
            price: { id: "price_1S96n6P5rNq9hGDSjEHrJV5g" },
            current_period_end: 1788220800,
          },
        ],
      },
    });

    const webhookModule = await import("../../../api/stripe/webhook.js");
    const handler = webhookModule.default as unknown as WebhookHandler;
    const res = createResponse();

    await handler(createRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("adopts a paid replacement when the stored subscription is inactive", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_replacement_paid",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_replacement_paid",
          object: "invoice",
          status: "paid",
          customer: "cus_123",
          billing_reason: "subscription_create",
          parent: {
            subscription_details: { subscription: "sub_replacement" },
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
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_replacement",
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
    retrieveSubscriptionMock.mockResolvedValueOnce({
      id: "sub_old",
      customer: "cus_123",
      status: "canceled",
    });
    queueSelect("profiles", {
      data: { id: "profile_123", email: "seller@example.com" },
    });
    queueSelect("profiles", {
      data: {
        stripe_subscription_id: "sub_old",
        subscription_status: "canceled",
        subscription_tier: "free",
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
    expect(updateFilterCalls).toContainEqual({
      table: "profiles",
      operator: "eq",
      column: "stripe_subscription_id",
      value: "sub_old",
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "reset_monthly_usage_for_paid_invoice",
      expect.objectContaining({
        p_stripe_subscription_id: "sub_replacement",
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

  it.each([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ])(
    "fulfills each pack from %s with the registered quantity",
    async (type) => {
      for (const quantity of [20, 50, 100]) {
        constructEventMock.mockReturnValue({
          type,
          data: {
            object: {
              id: `cs_pack_${quantity}`,
              mode: "payment",
              payment_status: "paid",
              customer: "cus_123",
              customer_details: { email: "seller@example.com" },
              metadata: {
                purchase_type: "credit_pack",
                profile_id: "profile_123",
                pack_id: `credits_${quantity}`,
                credits: String(quantity),
              },
            },
          },
        });
        const { default: handler } =
          await import("../../../api/stripe/webhook.js");
        const res = createResponse();
        await (handler as any)(createRequest() as any, res as any);
        expect(res.statusCode).toBe(200);
        expect(rpcMock).toHaveBeenCalledWith(
          "grant_credit_pack",
          expect.objectContaining({
            p_user_id: "profile_123",
            p_stripe_session_id: `cs_pack_${quantity}`,
            p_credits: quantity,
          }),
        );
      }
    },
  );

  it.each([
    ["unpaid", "credits_50", "50"],
    ["paid", "credits_50", "9999"],
    ["paid", "credits_999", "999"],
  ])(
    "does not grant an invalid or unpaid pack: %s %s %s",
    async (payment_status, pack_id, credits) => {
      constructEventMock.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_invalid",
            mode: "payment",
            payment_status,
            metadata: {
              purchase_type: "credit_pack",
              profile_id: "profile_123",
              pack_id,
              credits,
            },
          },
        },
      });
      const { default: handler } =
        await import("../../../api/stripe/webhook.js");
      await (handler as any)(createRequest() as any, createResponse() as any);
      expect(rpcMock).not.toHaveBeenCalledWith(
        "grant_credit_pack",
        expect.anything(),
      );
    },
  );

  it("audits delayed credit pack payments", async () => {
    const audit = await import("../../../utils/billingEvents.js");
    const spy = vi.spyOn(audit, "logStripeBillingEvent");
    const event = {
      id: "evt_delayed_pack",
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_delayed",
          mode: "payment",
          payment_status: "paid",
          customer_details: { email: "seller@example.com" },
          metadata: {
            purchase_type: "credit_pack",
            profile_id: "profile_123",
            pack_id: "credits_50",
            credits: "50",
          },
        },
      },
    };
    constructEventMock.mockReturnValue(event);
    try {
      const { default: handler } =
        await import("../../../api/stripe/webhook.js");
      await (handler as any)(createRequest() as any, createResponse() as any);
      expect(spy).toHaveBeenCalledWith({ event, email: "seller@example.com" });
    } finally {
      spy.mockRestore();
    }
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
      error: expect.objectContaining({ message: "constraint failed" }),
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
