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
      billing: {
        amountMinor: 399,
        currency: "eur",
        nextRenewalAt: "2026-10-13T00:00:00.000Z",
        statementDescriptor: "AUTOLISTER AI",
      },
    });

    expect(result).toEqual({ status: "sent", resendEmailId: "email_123" });
    expect(insertCalls[0]).toMatchObject({
      content_version: "paid-welcome/2026-10-28",
      payload_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      payload: sendMock.mock.calls[0][0],
    });
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
        subject: "Your AutoLister AI Starter plan is active",
        html: expect.stringContaining("€3.99/month"),
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

  it("retries the archived payload even when input billing, address or templates change", async () => {
    const payload = {
      from: "AutoLister AI <updates@autolister.app>",
      to: ["original@example.com"],
      subject: "Original confirmation",
      html: "<p>Original billing terms</p>",
      reply_to: "support@autolister.app",
    };
    queueSingle({ data: null, error: { code: "23505" } });
    queueSingle({
      data: {
        id: "welcome_123",
        idempotency_key: "original-key",
        status: "failed",
        payload,
        attempts: 1,
        first_attempt_at: new Date().toISOString(),
      },
      error: null,
    });
    queueSingle({
      data: { id: "welcome_123", idempotency_key: "original-key", payload },
      error: null,
    });
    const { sendSubscriptionWelcomeEmailOnce } =
      await import("../../../utils/subscriptionWelcomeEmail.js");
    await sendSubscriptionWelcomeEmailOnce({
      profileId: "profile_123",
      email: "changed@example.com",
      tier: "pro",
      stripeSubscriptionId: "sub_123",
    });
    expect(sendMock).toHaveBeenCalledWith(payload, {
      idempotencyKey: "original-key",
    });
  });

  it("holds an archived welcome for review after cancellation without rewriting its evidence", async () => {
    queueSingle({
      data: { id: "welcome_123", idempotency_key: "original-key" },
      error: null,
    });
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "temporary failure" },
    });
    const { sendSubscriptionWelcomeEmailOnce } =
      await import("../../../utils/subscriptionWelcomeEmail.js");
    const input = {
      profileId: "profile_123",
      email: "seller@example.com",
      tier: "pro",
      stripeSubscriptionId: "sub_123",
      billing: {
        policyVersion: "2026-10-28",
        initialCharge: { amountMinor: 999, currency: "eur" },
        recurringBase: { amountMinor: 999, currency: "eur" },
        nextRenewalAt: "2026-11-28T00:00:00Z",
      },
    };
    expect((await sendSubscriptionWelcomeEmailOnce(input)).status).toBe(
      "failed",
    );
    const payload = (insertCalls[0] as any).payload;
    expect(payload.html).toContain("Subscription details");
    expect(payload.html).toContain("Next renewal");
    expect(payload.html).not.toContain("Next renewal:");
    expect(payload.html).not.toContain("Model withdrawal form");
    expect(payload.html).toContain("attached");
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe(
      "AutoLister-subscription-terms-2026-10-28.pdf",
    );
    expect(
      Buffer.from(payload.attachments[0].content, "base64")
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    queueSingle({ data: null, error: { code: "23505" } });
    queueSingle({
      data: {
        id: "welcome_123",
        idempotency_key: "original-key",
        status: "failed",
        payload,
        attempts: 1,
        first_attempt_at: new Date().toISOString(),
      },
      error: null,
    });
    queueSingle({
      data: { id: "welcome_123", idempotency_key: "original-key", payload },
      error: null,
    });
    await expect(
      sendSubscriptionWelcomeEmailOnce({
        ...input,
        billing: {
          ...input.billing,
          renewalStopped: true,
          nextRenewalAt: null,
        },
      }),
    ).rejects.toThrow(
      "Cancellation requires welcome reconciliation before retry",
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(updateCalls.at(-1)).toMatchObject({
      status: "manual_review",
      locked_until: null,
      next_attempt_at: null,
    });
    expect(updateCalls.every((update: any) => !("payload" in update))).toBe(
      true,
    );
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

  it.each([
    null,
    {
      from: "AutoLister",
      to: ["seller@example.com"],
      reply_to: "support@autolister.app",
      subject: "Old",
      html: "Old",
    },
  ])(
    "reconciles ambiguous old attempts instead of sending again",
    async (payload) => {
      queueSingle({ data: null, error: { code: "23505" } });
      queueSingle({
        data: {
          id: "old",
          idempotency_key: "old-key",
          status: "failed",
          attempts: 1,
          payload,
          first_attempt_at: "2020-01-01T00:00:00Z",
        },
        error: null,
      });
      const { sendSubscriptionWelcomeEmailOnce } =
        await import("../../../utils/subscriptionWelcomeEmail.js");
      await expect(
        sendSubscriptionWelcomeEmailOnce({
          profileId: "profile_123",
          email: "seller@example.com",
          tier: "pro",
          stripeSubscriptionId: "sub_123",
        }),
      ).rejects.toThrow(/reconcile/);
      expect(sendMock).not.toHaveBeenCalled();
      expect(updateCalls).toContainEqual(
        expect.objectContaining({ status: "manual_review" }),
      );
    },
  );
});
