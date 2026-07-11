import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPricingOfferToken } from "../../../utils/pricingOfferToken";

type CheckoutHandler = (req: any, res: any) => Promise<unknown>;

const customerRetrieveMock = vi.fn();
const customerCreateMock = vi.fn();
const customerListMock = vi.fn();
const subscriptionRetrieveMock = vi.fn();
const subscriptionListMock = vi.fn();
const promotionCodeListMock = vi.fn();
const portalCreateMock = vi.fn();
const checkoutCreateMock = vi.fn();
const reportCriticalEndpointFailureMock = vi.fn();
const selectResponse = {
  data: null as unknown,
  error: null as unknown,
};

function createQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    single: vi.fn(async () => selectResponse),
  };

  return builder;
}

vi.mock("stripe", () => {
  function StripeMock(this: any) {
    this.customers = {
      retrieve: customerRetrieveMock,
      list: customerListMock,
      create: customerCreateMock,
    };
    this.subscriptions = {
      retrieve: subscriptionRetrieveMock,
      list: subscriptionListMock,
    };
    this.billingPortal = {
      sessions: {
        create: portalCreateMock,
      },
    };
    this.promotionCodes = {
      list: promotionCodeListMock,
    };
    this.checkout = {
      sessions: {
        create: checkoutCreateMock,
      },
    };
  }

  return { default: StripeMock };
});

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => createQueryBuilder()),
  },
}));

vi.mock("../../../utils/checkoutCors", () => ({
  handleCheckoutCors: vi.fn(async () => true),
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: reportCriticalEndpointFailureMock,
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
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

describe("create checkout", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_PORTAL_RETURN_URL = "https://autolister.app/pricing";
    process.env.PRICING_OFFER_TOKEN_SECRET = "test-offer-secret";
    selectResponse.data = null;
    selectResponse.error = null;
    vi.clearAllMocks();
    customerListMock.mockResolvedValue({ data: [] });
    customerCreateMock.mockResolvedValue({ id: "cus_new" });
    subscriptionListMock.mockResolvedValue({ data: [] });
    promotionCodeListMock.mockResolvedValue({
      data: [{ id: "promo_listfaster20" }],
    });
    checkoutCreateMock.mockResolvedValue({
      url: "https://checkout.stripe.com/session/test",
    });
  });

  it("applies a valid pricing offer coupon to checkout", async () => {
    const offerToken = createPricingOfferToken({
      email: "customer@example.com",
      targetTier: "pro",
      couponCode: "LISTFASTER20",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    selectResponse.data = {
      id: "profile_123",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockResolvedValue({ id: "cus_existing" });

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as unknown as CheckoutHandler;
    const req = {
      method: "POST",
      body: {
        email: "customer@example.com",
        tier: "pro",
        source: "pricing_offer",
        offerToken,
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(promotionCodeListMock).toHaveBeenCalledWith({
      code: "LISTFASTER20",
      active: true,
      limit: 1,
    });
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: "promo_listfaster20" }],
      }),
    );
    expect(checkoutCreateMock.mock.calls[0][0]).not.toHaveProperty(
      "allow_promotion_codes",
    );
  });

  it("routes active paid subscribers to the customer portal instead of creating a second subscription", async () => {
    selectResponse.data = {
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_existing",
      subscription_status: "active",
      subscription_tier: "starter",
    };
    customerRetrieveMock.mockResolvedValue({ id: "cus_existing" });
    subscriptionRetrieveMock.mockResolvedValue({
      id: "sub_existing",
      status: "active",
      customer: "cus_existing",
    });
    portalCreateMock.mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as unknown as CheckoutHandler;
    const req = {
      method: "POST",
      body: {
        email: "customer@example.com",
        tier: "pro",
        source: "pricing_page",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      url: "https://billing.stripe.com/session/test",
      mode: "portal",
      reason: "existing_active_subscription",
    });
    expect(portalCreateMock).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://autolister.app/pricing",
      flow_data: {
        type: "subscription_update",
        subscription_update: {
          subscription: "sub_existing",
        },
      },
    });
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("uses Stripe as the source of truth when Supabase says free but the customer has an active subscription", async () => {
    selectResponse.data = {
      id: "profile_123",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockResolvedValue({ id: "cus_existing" });
    subscriptionListMock.mockResolvedValue({
      data: [
        {
          id: "sub_live",
          status: "active",
          customer: "cus_existing",
        },
      ],
    });
    subscriptionRetrieveMock.mockResolvedValue({
      id: "sub_live",
      status: "active",
      customer: "cus_existing",
    });
    portalCreateMock.mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as unknown as CheckoutHandler;
    const req = {
      method: "POST",
      body: {
        email: "customer@example.com",
        tier: "pro",
        source: "pricing_page",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      url: "https://billing.stripe.com/session/test",
      mode: "portal",
      reason: "existing_active_subscription",
    });
    expect(portalCreateMock).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://autolister.app/pricing",
      flow_data: {
        type: "subscription_update",
        subscription_update: {
          subscription: "sub_live",
        },
      },
    });
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("recovers an existing Stripe subscription by email when Supabase has no customer id", async () => {
    selectResponse.data = {
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerListMock.mockResolvedValue({
      data: [{ id: "cus_found", email: "customer@example.com" }],
    });
    subscriptionListMock.mockResolvedValue({
      data: [
        {
          id: "sub_found",
          status: "active",
          customer: "cus_found",
        },
      ],
    });
    subscriptionRetrieveMock.mockResolvedValue({
      id: "sub_found",
      status: "active",
      customer: "cus_found",
    });
    portalCreateMock.mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as unknown as CheckoutHandler;
    const req = {
      method: "POST",
      body: {
        email: "customer@example.com",
        tier: "pro",
        source: "pricing_page",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      url: "https://billing.stripe.com/session/test",
      mode: "portal",
      reason: "existing_active_subscription",
    });
    expect(portalCreateMock).toHaveBeenCalledWith({
      customer: "cus_found",
      return_url: "https://autolister.app/pricing",
      flow_data: {
        type: "subscription_update",
        subscription_update: {
          subscription: "sub_found",
        },
      },
    });
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("logs a critical failure when subscription checkout creation fails", async () => {
    selectResponse.data = {
      id: "profile_123",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockResolvedValue({ id: "cus_existing" });
    checkoutCreateMock.mockRejectedValue(new Error("Stripe unavailable"));

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as unknown as CheckoutHandler;
    const req = {
      method: "POST",
      body: {
        email: "customer@example.com",
        tier: "pro",
        source: "pricing_page",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/stripe/create-checkout",
      status: 500,
      userId: "profile_123",
      details: {
        tier: "pro",
        source: "pricing_page",
        error: "Stripe unavailable",
        errorName: "Error",
      },
    });
  });
});
