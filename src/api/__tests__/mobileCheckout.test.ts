import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalAllowedOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS;

const {
  authGetUserMock,
  fromMock,
  customerRetrieveMock,
  customerCreateMock,
  customerListMock,
  subscriptionRetrieveMock,
  subscriptionListMock,
  portalCreateMock,
  checkoutCreateMock,
  promotionCodeListMock,
  reportCriticalEndpointFailureMock,
  profileResponse,
  queryBuilders,
} = vi.hoisted(() => ({
  authGetUserMock: vi.fn(),
  fromMock: vi.fn(),
  customerRetrieveMock: vi.fn(),
  customerCreateMock: vi.fn(),
  customerListMock: vi.fn(),
  subscriptionRetrieveMock: vi.fn(),
  subscriptionListMock: vi.fn(),
  portalCreateMock: vi.fn(),
  checkoutCreateMock: vi.fn(),
  promotionCodeListMock: vi.fn(),
  reportCriticalEndpointFailureMock: vi.fn(),
  profileResponse: { data: null as unknown, error: null as unknown },
  queryBuilders: [] as Array<Record<string, any>>,
}));

vi.mock("stripe", () => {
  function StripeMock(this: any) {
    this.customers = {
      retrieve: customerRetrieveMock,
      create: customerCreateMock,
      list: customerListMock,
    };
    this.subscriptions = {
      retrieve: subscriptionRetrieveMock,
      list: subscriptionListMock,
    };
    this.billingPortal = { sessions: { create: portalCreateMock } };
    this.checkout = { sessions: { create: checkoutCreateMock } };
    this.promotionCodes = { list: promotionCodeListMock };
  }

  return { default: StripeMock };
});

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser: authGetUserMock },
    from: fromMock,
  },
}));

vi.mock("../../../utils/checkoutCors", () => ({
  handleCheckoutCors: vi.fn(async () => true),
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: reportCriticalEndpointFailureMock,
}));

function createQueryBuilder() {
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    single: vi.fn(async () => profileResponse),
  };
  queryBuilders.push(builder);
  return builder;
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
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

function mobileRequest(body: Record<string, unknown> = {}) {
  return {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "x-autolister-client": "mobile_web",
      origin: "https://autolister.app",
    },
    body: { tier: "starter", ...body },
  };
}

function extensionRequest(body: Record<string, unknown> = {}) {
  return {
    method: "POST",
    headers: {},
    body: { tier: "starter", ...body },
  };
}

describe("bearer-owned mobile Stripe billing", () => {
  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.VERCEL_APP_ALLOWED_ORIGINS;
    } else {
      process.env.VERCEL_APP_ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_SUCCESS_URL = "https://autolister.app/success";
    process.env.STRIPE_CANCEL_URL = "https://autolister.app/cancel";
    process.env.STRIPE_PORTAL_RETURN_URL = "https://autolister.app/pricing";
    process.env.PRICING_OFFER_TOKEN_SECRET = "test-offer-secret";
    process.env.VERCEL_APP_ALLOWED_ORIGINS = "https://preview.autolister.app";

    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    profileResponse.error = null;
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "bearer-user" } },
      error: null,
    });
    fromMock.mockImplementation(() => createQueryBuilder());
    customerRetrieveMock.mockResolvedValue({ id: "cus_existing" });
    customerCreateMock.mockResolvedValue({ id: "cus_mobile" });
    customerListMock.mockResolvedValue({ data: [] });
    subscriptionListMock.mockResolvedValue({ data: [] });
    subscriptionRetrieveMock.mockResolvedValue({
      id: "sub_owner",
      status: "active",
      customer: "cus_owner",
    });
    portalCreateMock.mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });
    checkoutCreateMock.mockResolvedValue({
      url: "https://checkout.stripe.com/session/test",
    });
    promotionCodeListMock.mockResolvedValue({ data: [] });
    queryBuilders.length = 0;
    vi.clearAllMocks();
  });

  it("resolves the bearer user before any email ownership input", async () => {
    const { resolveMobileBillingProfile } =
      await import("../../../utils/mobileCheckout.js");

    const profile = await resolveMobileBillingProfile({
      headers: { authorization: "Bearer token" },
    } as any);

    expect(authGetUserMock).toHaveBeenCalledWith("token");
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilders[0].select).toHaveBeenCalledWith(
      "id, email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier",
    );
    expect(queryBuilders[0].eq).toHaveBeenCalledWith("id", "bearer-user");
    expect(profile).toEqual({
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    });
  });

  it("uses fixed approved app checkout URLs and falls back from an unapproved origin", async () => {
    const { getMobileCheckoutUrls, getMobilePortalReturnUrl } =
      await import("../../../utils/mobileCheckout.js");

    expect(
      getMobileCheckoutUrls({
        origin: "https://autolister.app",
        status: "success",
      }),
    ).toBe(
      "https://autolister.app/app?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(
      getMobileCheckoutUrls({
        origin: "https://preview.autolister.app",
        status: "cancel",
      }),
    ).toBe(
      "https://preview.autolister.app/app?checkout=cancel&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(getMobilePortalReturnUrl("https://evil.example")).toBe(
      "https://autolister.app/app?checkout=manage",
    );
  });

  it("authenticates before legacy email resolution and ignores client ownership fields", async () => {
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(
      mobileRequest({
        email: "attacker@example.com",
        userId: "other-user",
        source: "auto_lister_extension",
        returnUrl: "https://evil.example/steal",
      }) as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(authGetUserMock).toHaveBeenCalledWith("token");
    expect(queryBuilders[0].eq).toHaveBeenCalledWith("id", "bearer-user");
    expect(queryBuilders[0].ilike).not.toHaveBeenCalledWith(
      "email",
      "attacker@example.com",
    );
    expect(customerCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        metadata: { source: "mobile_web" },
      }),
    );
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ source: "mobile_web" }),
        success_url:
          "https://autolister.app/app?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url:
          "https://autolister.app/app?checkout=cancel&session_id={CHECKOUT_SESSION_ID}",
      }),
    );
  });

  it("sends active bearer subscribers to the app portal return", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_owner",
      stripe_subscription_id: "sub_owner",
      subscription_status: "active",
      subscription_tier: "starter",
    };
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(mobileRequest({ tier: "pro" }) as any, response as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      url: "https://billing.stripe.com/session/test",
      mode: "portal",
      reason: "existing_active_subscription",
    });
    expect(portalCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_owner",
        return_url: "https://autolister.app/app?checkout=manage",
        flow_data: {
          type: "subscription_update",
          subscription_update: { subscription: "sub_owner" },
        },
      }),
    );
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("keeps extension checkout email ownership and metadata unchanged", async () => {
    profileResponse.data = {
      id: "extension-profile",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(
      extensionRequest({
        email: "extension@example.com",
        source: "auto_lister_extension",
      }) as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(authGetUserMock).not.toHaveBeenCalled();
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ source: "auto_lister_extension" }),
      }),
    );
  });

  it("creates a bearer-owned portal session without trusting body email", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_owner",
      stripe_subscription_id: "sub_owner",
      subscription_status: "active",
      subscription_tier: "starter",
    };
    const portalModule = await import("../../../api/stripe/create-portal.js");
    const handler = portalModule.default as any;
    const response = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "x-autolister-client": "mobile_web",
          origin: "https://autolister.app",
        },
        body: { email: "attacker@example.com" },
      } as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(subscriptionRetrieveMock).toHaveBeenCalledWith("sub_owner");
    expect(portalCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_owner",
        return_url: "https://autolister.app/app?checkout=manage",
      }),
    );
    expect(queryBuilders[0].ilike).not.toHaveBeenCalledWith(
      "email",
      "attacker@example.com",
    );
  });
});
