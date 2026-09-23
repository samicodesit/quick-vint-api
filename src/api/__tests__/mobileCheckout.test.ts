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
  profileUpdateResponse,
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
  profileUpdateResponse: { error: null as unknown },
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
    isUpdate: false,
    select: vi.fn(() => builder),
    update: vi.fn(() => {
      builder.isUpdate = true;
      return builder;
    }),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    single: vi.fn(async () => profileResponse),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown,
    ) =>
      Promise.resolve(
        builder.isUpdate ? profileUpdateResponse : profileResponse,
      ).then(resolve, reject),
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
    process.env.MOBILE_WEB_APP_ENABLED = "true";
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
    profileUpdateResponse.error = null;
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

  it("returns the disabled response before mobile billing ownership lookup", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const checkoutResponse = createResponse();
    await (checkoutModule.default as any)(
      mobileRequest(),
      checkoutResponse as any,
    );

    expect(checkoutResponse.statusCode).toBe(404);
    expect(checkoutResponse.body).toEqual({
      error: "Mobile web app unavailable.",
      code: "mobile_web_disabled",
    });

    const portalModule = await import("../../../api/stripe/create-portal.js");
    const portalResponse = createResponse();
    await (portalModule.default as any)(mobileRequest(), portalResponse as any);

    expect(portalResponse.statusCode).toBe(404);
    expect(portalResponse.body).toEqual({
      error: "Mobile web app unavailable.",
      code: "mobile_web_disabled",
    });
    expect(authGetUserMock).not.toHaveBeenCalled();
    expect(customerRetrieveMock).not.toHaveBeenCalled();
    expect(portalCreateMock).not.toHaveBeenCalled();
    expect(checkoutCreateMock).not.toHaveBeenCalled();
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
    expect(getMobilePortalReturnUrl("chrome-extension://test-extension")).toBe(
      "https://autolister.app/app?checkout=manage",
    );
  });

  it("recovers an existing bearer Stripe subscription by authenticated profile email", async () => {
    customerListMock.mockResolvedValue({
      data: [{ id: "cus_recovered", email: "owner@example.com" }],
    });
    subscriptionListMock.mockResolvedValue({
      data: [
        { id: "sub_recovered", status: "active", customer: "cus_recovered" },
      ],
    });
    customerRetrieveMock.mockResolvedValue({
      id: "cus_recovered",
      email: "owner@example.com",
    });
    subscriptionRetrieveMock.mockResolvedValue({
      id: "sub_recovered",
      status: "active",
      customer: "cus_recovered",
    });

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const checkoutResponse = createResponse();
    await (checkoutModule.default as any)(
      mobileRequest({ email: "attacker@example.com" }) as any,
      checkoutResponse as any,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    expect(checkoutResponse.body).toMatchObject({ mode: "portal" });
    expect(customerCreateMock).not.toHaveBeenCalled();
    expect(portalCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_recovered",
        return_url: "https://autolister.app/app?checkout=manage",
        flow_data: {
          type: "subscription_update",
          subscription_update: { subscription: "sub_recovered" },
        },
      }),
    );
  });

  it("fails closed when authenticated email billing lookup is ambiguous", async () => {
    customerListMock.mockResolvedValue({
      data: [
        { id: "cus_one", email: "owner@example.com" },
        { id: "cus_two", email: "owner@example.com" },
      ],
    });
    customerRetrieveMock.mockImplementation(async (customerId: string) => ({
      id: customerId,
      email: "owner@example.com",
    }));
    subscriptionListMock.mockImplementation(async ({ customer }: any) => ({
      data: [{ id: `sub_${customer}`, status: "active", customer }],
    }));
    subscriptionRetrieveMock.mockImplementation(
      async (subscriptionId: string) => ({
        id: subscriptionId,
        status: "active",
        customer: subscriptionId.replace(/^sub_/, ""),
      }),
    );

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const response = createResponse();
    await (checkoutModule.default as any)(
      mobileRequest() as any,
      response as any,
    );

    expect(response.statusCode).toBe(500);
    expect(customerCreateMock).not.toHaveBeenCalled();
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("fails closed on a transient authenticated email billing lookup", async () => {
    customerListMock.mockRejectedValueOnce(new Error("Stripe timeout"));

    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const response = createResponse();
    await (checkoutModule.default as any)(
      mobileRequest() as any,
      response as any,
    );

    expect(response.statusCode).toBe(500);
    expect(customerCreateMock).not.toHaveBeenCalled();
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("recovers an existing bearer portal subscription when the profile customer id is missing", async () => {
    customerListMock.mockResolvedValue({
      data: [{ id: "cus_recovered", email: "owner@example.com" }],
    });
    subscriptionListMock.mockResolvedValue({
      data: [
        { id: "sub_recovered", status: "active", customer: "cus_recovered" },
      ],
    });
    customerRetrieveMock.mockResolvedValue({
      id: "cus_recovered",
      email: "owner@example.com",
    });
    subscriptionRetrieveMock.mockResolvedValue({
      id: "sub_recovered",
      status: "active",
      customer: "cus_recovered",
    });

    const portalModule = await import("../../../api/stripe/create-portal.js");
    const response = createResponse();
    await (portalModule.default as any)(
      mobileRequest() as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(portalCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_recovered",
        return_url: "https://autolister.app/app?checkout=manage",
        flow_data: {
          type: "subscription_update",
          subscription_update: { subscription: "sub_recovered" },
        },
      }),
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
      expect.objectContaining({
        idempotencyKey: "mobile-web-customer:bearer-user",
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

  it("preserves a sanitized creator ref only in mobile checkout metadata", async () => {
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(
      mobileRequest({ utm: { ref: "Creator Name/2026" } }) as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ref: "creator-name-2026" }),
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

  it("fails closed on a transient checkout customer lookup error", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_owner",
      stripe_subscription_id: "sub_owner",
      subscription_status: "active",
      subscription_tier: "starter",
    };
    customerRetrieveMock.mockRejectedValueOnce(new Error("Stripe timeout"));
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(mobileRequest({ tier: "pro" }) as any, response as any);

    expect(response.statusCode).toBe(500);
    expect(customerCreateMock).not.toHaveBeenCalled();
    expect(checkoutCreateMock).not.toHaveBeenCalled();
    expect(portalCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["resource_missing", { code: "resource_missing" }],
    ["deleted customer", { id: "cus_owner", deleted: true }],
  ])(
    "recovers from a confirmed missing checkout customer: %s",
    async (_name, result) => {
      profileResponse.data = {
        id: "bearer-user",
        email: "owner@example.com",
        stripe_customer_id: "cus_owner",
        stripe_subscription_id: null,
        subscription_status: "free",
        subscription_tier: "free",
      };
      if ("code" in result) {
        customerRetrieveMock.mockRejectedValueOnce(result);
      } else {
        customerRetrieveMock.mockResolvedValueOnce(result);
      }
      const checkoutModule =
        await import("../../../api/stripe/create-checkout.js");
      const handler = checkoutModule.default as any;
      const response = createResponse();

      await handler(mobileRequest() as any, response as any);

      expect(response.statusCode).toBe(200);
      expect(customerCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "owner@example.com" }),
        expect.objectContaining({
          idempotencyKey:
            "mobile-web-customer:bearer-user:replacement:cus_owner",
        }),
      );
      expect(checkoutCreateMock).toHaveBeenCalled();
    },
  );

  it("uses a distinct replacement key for a deleted stored customer", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_deleted",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockResolvedValueOnce({
      id: "cus_deleted",
      deleted: true,
    });
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(mobileRequest() as any, response as any);

    expect(response.statusCode).toBe(200);
    expect(customerCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        idempotencyKey:
          "mobile-web-customer:bearer-user:replacement:cus_deleted",
      }),
    );
    expect(customerCreateMock.mock.calls[0][1]).not.toEqual({
      idempotencyKey: "mobile-web-customer:bearer-user",
    });
  });

  it("uses a stable replacement key for a resource-missing stored customer", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_missing",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockRejectedValueOnce({ code: "resource_missing" });
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(mobileRequest() as any, response as any);

    expect(response.statusCode).toBe(200);
    expect(customerCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        idempotencyKey:
          "mobile-web-customer:bearer-user:replacement:cus_missing",
      }),
    );
  });

  it("keeps extension checkout email ownership and metadata unchanged", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";
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
    expect(
      checkoutCreateMock.mock.calls.at(-1)?.[0].metadata,
    ).not.toHaveProperty("ref");
  });

  it("keeps extension portal behavior enabled when the mobile flag is disabled", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";
    profileResponse.data = {
      id: "extension-profile",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      subscription_status: "active",
      subscription_tier: "pro",
    };

    const portalModule = await import("../../../api/stripe/create-portal.js");
    const handler = portalModule.default as any;
    const response = createResponse();

    await handler(
      {
        method: "POST",
        headers: {},
        body: { email: "extension@example.com" },
      } as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(portalCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
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

  it("fails closed on a transient portal customer lookup error", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_owner",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockRejectedValueOnce(new Error("Stripe timeout"));
    const portalModule = await import("../../../api/stripe/create-portal.js");
    const handler = portalModule.default as any;
    const response = createResponse();

    await handler(mobileRequest() as any, response as any);

    expect(response.statusCode).toBe(500);
    expect(portalCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["resource_missing", { code: "resource_missing" }],
    ["deleted customer", { id: "cus_owner", deleted: true }],
  ])(
    "does not trust a confirmed missing portal customer: %s",
    async (_name, result) => {
      profileResponse.data = {
        id: "bearer-user",
        email: "owner@example.com",
        stripe_customer_id: "cus_owner",
        stripe_subscription_id: null,
        subscription_status: "free",
        subscription_tier: "free",
      };
      if ("code" in result) {
        customerRetrieveMock.mockRejectedValueOnce(result);
      } else {
        customerRetrieveMock.mockResolvedValueOnce(result);
      }
      const portalModule = await import("../../../api/stripe/create-portal.js");
      const handler = portalModule.default as any;
      const response = createResponse();

      await handler(mobileRequest() as any, response as any);

      expect(response.statusCode).toBe(400);
      expect(portalCreateMock).not.toHaveBeenCalled();
    },
  );

  it("does not create checkout when linking a new customer fails", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    profileUpdateResponse.error = { message: "database unavailable" };
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const response = createResponse();

    await handler(mobileRequest() as any, response as any);

    expect(response.statusCode).toBe(500);
    expect(customerCreateMock).toHaveBeenCalledTimes(1);
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("retries an initial no-customer profile with the same idempotency key", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    const customersByKey = new Map<string, { id: string }>();
    customerCreateMock.mockImplementation(
      async (_params: unknown, options: { idempotencyKey?: string } = {}) => {
        const key = options.idempotencyKey || "";
        const existing = customersByKey.get(key);
        if (existing) return existing;
        const customer = { id: `cus_retry_${customersByKey.size + 1}` };
        customersByKey.set(key, customer);
        return customer;
      },
    );
    profileUpdateResponse.error = { message: "database unavailable" };
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const firstResponse = createResponse();

    await handler(mobileRequest() as any, firstResponse as any);

    profileUpdateResponse.error = null;
    const secondResponse = createResponse();
    await handler(mobileRequest() as any, secondResponse as any);

    expect(firstResponse.statusCode).toBe(500);
    expect(secondResponse.statusCode).toBe(200);
    expect(customerCreateMock).toHaveBeenCalledTimes(2);
    expect(customerCreateMock.mock.calls[0][1]).toEqual({
      idempotencyKey: "mobile-web-customer:bearer-user",
    });
    expect(customerCreateMock.mock.calls[1][1]).toEqual({
      idempotencyKey: "mobile-web-customer:bearer-user",
    });
    expect(checkoutCreateMock).toHaveBeenCalledTimes(1);
  });

  it("reuses one replacement key across persistence retries", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_deleted",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockRejectedValue({ code: "resource_missing" });
    const customersByKey = new Map<string, { id: string }>();
    customerCreateMock.mockImplementation(
      async (_params: unknown, options: { idempotencyKey?: string } = {}) => {
        const key = options.idempotencyKey || "";
        const existing = customersByKey.get(key);
        if (existing) return existing;
        const customer = { id: `cus_replacement_${customersByKey.size + 1}` };
        customersByKey.set(key, customer);
        return customer;
      },
    );
    profileUpdateResponse.error = { message: "database unavailable" };
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const firstResponse = createResponse();

    await handler(mobileRequest() as any, firstResponse as any);

    profileUpdateResponse.error = null;
    const secondResponse = createResponse();
    await handler(mobileRequest() as any, secondResponse as any);

    const expectedKey =
      "mobile-web-customer:bearer-user:replacement:cus_deleted";
    expect(firstResponse.statusCode).toBe(500);
    expect(secondResponse.statusCode).toBe(200);
    expect(customerCreateMock).toHaveBeenCalledTimes(2);
    expect(customerCreateMock.mock.calls[0][1]).toEqual({
      idempotencyKey: expectedKey,
    });
    expect(customerCreateMock.mock.calls[1][1]).toEqual({
      idempotencyKey: expectedKey,
    });
    expect(checkoutCreateMock).toHaveBeenCalledTimes(1);
  });

  it("advances the replacement key when a replacement customer is later deleted", async () => {
    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_original",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockResolvedValueOnce({
      id: "cus_original",
      deleted: true,
    });
    customerCreateMock.mockResolvedValueOnce({ id: "cus_replacement" });
    const checkoutModule =
      await import("../../../api/stripe/create-checkout.js");
    const handler = checkoutModule.default as any;
    const firstResponse = createResponse();

    await handler(mobileRequest() as any, firstResponse as any);

    profileResponse.data = {
      id: "bearer-user",
      email: "owner@example.com",
      stripe_customer_id: "cus_replacement",
      stripe_subscription_id: null,
      subscription_status: "free",
      subscription_tier: "free",
    };
    customerRetrieveMock.mockResolvedValueOnce({
      id: "cus_replacement",
      deleted: true,
    });
    customerCreateMock.mockResolvedValueOnce({ id: "cus_replacement_2" });
    const secondResponse = createResponse();

    await handler(mobileRequest() as any, secondResponse as any);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(customerCreateMock.mock.calls[0][1]).toEqual({
      idempotencyKey:
        "mobile-web-customer:bearer-user:replacement:cus_original",
    });
    expect(customerCreateMock.mock.calls[1][1]).toEqual({
      idempotencyKey:
        "mobile-web-customer:bearer-user:replacement:cus_replacement",
    });
    expect(customerCreateMock.mock.calls[0][1]).not.toEqual(
      customerCreateMock.mock.calls[1][1],
    );
  });
});
