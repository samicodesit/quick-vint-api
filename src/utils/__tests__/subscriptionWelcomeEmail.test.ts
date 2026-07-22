import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const sendMock = vi.fn();
const logRequestMock = vi.fn();
const singleResponses: Array<{ data: unknown; error: unknown }> = [];
const insertCalls: unknown[] = [];
const updateCalls: unknown[] = [];

function queueSingle(response: { data: unknown; error: unknown }) {
  singleResponses.push(response);
}

function createSupabaseBuilder() {
  const builder = {
    insert: vi.fn((values: unknown) => {
      insertCalls.push(values);
      return builder;
    }),
    update: vi.fn((values: unknown) => {
      updateCalls.push(values);
      return builder;
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    single: vi.fn(async () => {
      const response = singleResponses.shift();
      if (!response) throw new Error("Unexpected Supabase single call");
      return response;
    }),
    then: vi.fn((resolve, reject) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
    ),
  };

  return builder;
}

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {
      emails: {
        send: sendMock,
      },
    };
  }),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    logRequest: logRequestMock,
  },
}));

describe("subscription welcome email sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleResponses.length = 0;
    insertCalls.length = 0;
    updateCalls.length = 0;
    process.env.RESEND_API_KEY = "resend-key";
    fromMock.mockImplementation(() => createSupabaseBuilder());
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
  });

  it("sends a plan welcome email when the database grants the once-only claim", async () => {
    queueSingle({
      data: {
        id: "welcome_123",
        idempotency_key: "subscription-welcome/sub_123/starter_welcome_v1",
      },
      error: null,
    });

    const { sendSubscriptionWelcomeEmailOnce } =
      await import("../../../utils/subscriptionWelcomeEmail.js");

    const result = await sendSubscriptionWelcomeEmailOnce({
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "starter",
      stripeSubscriptionId: "sub_123",
      stripeCheckoutSessionId: "cs_123",
    });

    expect(result).toEqual({ status: "sent", resendEmailId: "email_123" });
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        user_id: "profile_123",
        email: "seller@example.com",
        tier: "starter",
        template_key: "starter_welcome_v1",
        stripe_subscription_id: "sub_123",
        stripe_checkout_session_id: "cs_123",
        idempotency_key: "subscription-welcome/sub_123/starter_welcome_v1",
        status: "sending",
        attempts: 1,
      }),
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "AutoLister AI <updates@autolister.app>",
        to: ["seller@example.com"],
        subject: "Welcome to Starter - your plan is active",
        html: expect.stringContaining("Your Starter plan is active."),
      }),
      {
        idempotencyKey: "subscription-welcome/sub_123/starter_welcome_v1",
      },
    );
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        resend_email_id: "email_123",
        sent_at: expect.any(String),
      }),
    );
    expect(logRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "profile_123",
        userEmail: "seller@example.com",
        endpoint: "/event/subscription_welcome_email_sent",
      }),
    );
  });

  it("does not send when the subscription welcome email was already claimed", async () => {
    queueSingle({
      data: null,
      error: { code: "23505" },
    });
    queueSingle({
      data: {
        id: "welcome_123",
        idempotency_key: "subscription-welcome/sub_123/starter_welcome_v1",
        status: "sent",
        locked_until: null,
        attempts: 1,
      },
      error: null,
    });

    const { sendSubscriptionWelcomeEmailOnce } =
      await import("../../../utils/subscriptionWelcomeEmail.js");

    const result = await sendSubscriptionWelcomeEmailOnce({
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "starter",
      stripeSubscriptionId: "sub_123",
      stripeCheckoutSessionId: "cs_123",
    });

    expect(result).toEqual({ status: "skipped" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("marks the claim failed when Resend rejects the send", async () => {
    queueSingle({
      data: {
        id: "welcome_123",
        idempotency_key: "subscription-welcome/sub_123/pro_welcome_v1",
      },
      error: null,
    });
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Resend down" },
    });

    const { sendSubscriptionWelcomeEmailOnce } =
      await import("../../../utils/subscriptionWelcomeEmail.js");

    const result = await sendSubscriptionWelcomeEmailOnce({
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "pro",
      stripeSubscriptionId: "sub_123",
      stripeCheckoutSessionId: "cs_123",
    });

    expect(result).toEqual({ status: "failed", error: "Resend down" });
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error: "Resend down",
        next_attempt_at: expect.any(String),
      }),
    );
  });
});
