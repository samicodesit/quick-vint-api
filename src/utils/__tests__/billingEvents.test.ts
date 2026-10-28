import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  },
}));

describe("billing events", () => {
  it("preserves actual consent and presentment without retroactively inventing acceptance", async () => {
    const { buildStripeBillingEventRow } =
      await import("../../../utils/billingEvents.js");
    const event: any = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      created: 1784660000,
      data: {
        object: {
          id: "cs_123",
          object: "checkout.session",
          customer: "cus_123",
          subscription: "sub_123",
          amount_total: 999,
          currency: "eur",
          presentment_details: {
            presentment_amount: 881,
            presentment_currency: "gbp",
          },
          consent: { terms_of_service: "accepted" },
          custom_text: { submit: { message: "Actual old notice" } },
          metadata: {
            billing_policy_version: "old-version",
            unrelated_secret: "must-not-archive",
          },
          client_secret: "must-not-archive",
        },
      },
    };
    const row = buildStripeBillingEventRow({ event });
    expect(row.raw_event).toMatchObject({
      consent: { terms_of_service: "accepted" },
      custom_text: { submit: { message: "Actual old notice" } },
      policy: { version: "old-version" },
      presentment_details: {
        presentment_amount: 881,
        presentment_currency: "gbp",
      },
    });
    expect(JSON.stringify(row)).not.toContain("must-not-archive");
    delete event.data.object.consent;
    delete event.data.object.metadata;
    expect(buildStripeBillingEventRow({ event }).raw_event).toMatchObject({
      consent: null,
      policy: { version: null },
    });
  });

  it("retries failed durable webhook writes but accepts duplicate event deliveries", async () => {
    const { logStripeBillingEvent } =
      await import("../../../utils/billingEvents.js");
    const event: any = {
      id: "evt_1",
      type: "customer.subscription.updated",
      created: 1784660000,
      data: { object: { id: "sub_1", object: "subscription" } },
    };
    insertMock.mockResolvedValueOnce({
      error: { code: "XX000", message: "database unavailable" },
    });
    await expect(logStripeBillingEvent({ event })).rejects.toMatchObject({
      code: "XX000",
    });
    insertMock.mockResolvedValueOnce({ error: { code: "23505" } });
    await expect(logStripeBillingEvent({ event })).resolves.toBeUndefined();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ data: null, error: null });
  });

  it("serializes invoice payment failures into durable billing event rows", async () => {
    const { buildStripeBillingEventRow } =
      await import("../../../utils/billingEvents.js");

    const row = buildStripeBillingEventRow({
      event: {
        id: "evt_payment_failed",
        type: "invoice.payment_failed",
        created: 1784660000,
        data: {
          object: {
            id: "in_123",
            object: "invoice",
            customer: "cus_123",
            subscription: "sub_123",
            status: "open",
            amount_due: 399,
            amount_remaining: 399,
            currency: "eur",
            attempt_count: 3,
            next_payment_attempt: 1784853100,
            billing_reason: "subscription_cycle",
          },
        },
      } as any,
      profileId: "profile_123",
      email: "seller@example.com",
    });

    expect(row).toMatchObject({
      user_id: "profile_123",
      user_email: "seller@example.com",
      source: "stripe_webhook",
      event_type: "invoice.payment_failed",
      stripe_event_id: "evt_payment_failed",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      stripe_invoice_id: "in_123",
      status: "open",
      amount_due: 399,
      amount_remaining: 399,
      currency: "eur",
      attempt_count: 3,
      next_payment_attempt: "2026-07-24T00:31:40.000Z",
      billing_reason: "subscription_cycle",
    });
    expect(row.stripe_event_created_at).toBe("2026-07-21T18:53:20.000Z");
    expect(row.raw_event).toMatchObject({
      stripeEventId: "evt_payment_failed",
      objectId: "in_123",
    });
  });

  it("logs admin billing actions with before and after summaries", async () => {
    const { logAdminBillingAction } =
      await import("../../../utils/billingEvents.js");

    await logAdminBillingAction({
      action: "cancel",
      profileId: "profile_123",
      email: "seller@example.com",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeInvoiceId: "in_123",
      before: { collectible_invoice_count: 1 },
      after: { collectible_invoice_count: 0 },
      metadata: { voidedInvoices: ["in_123"] },
    });

    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: "profile_123",
        user_email: "seller@example.com",
        source: "admin",
        event_type: "admin.billing.cancel",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        stripe_invoice_id: "in_123",
        raw_event: {
          action: "cancel",
          before: { collectible_invoice_count: 1 },
          after: { collectible_invoice_count: 0 },
          metadata: { voidedInvoices: ["in_123"] },
        },
      }),
    ]);
  });

  it("detects Supabase and Stripe billing drift without admin input", async () => {
    const { getBillingDriftReasons } =
      await import("../../../utils/billingEvents.js");

    expect(
      getBillingDriftReasons({
        profile: {
          subscription_status: "canceled",
          subscription_tier: "free",
        },
        stripe: {
          activeLikeSubscriptionCount: 0,
          collectibleInvoiceCount: 1,
          collectibleAmountRemaining: 399,
          hasCancelAtPeriodEnd: false,
        },
      }),
    ).toEqual(["open_invoice_for_free_or_canceled_profile"]);

    expect(
      getBillingDriftReasons({
        profile: {
          subscription_status: "active",
          subscription_tier: "starter",
        },
        stripe: {
          activeLikeSubscriptionCount: 0,
          collectibleInvoiceCount: 0,
          collectibleAmountRemaining: 0,
          hasCancelAtPeriodEnd: false,
        },
      }),
    ).toEqual(["paid_profile_without_active_stripe_subscription"]);
  });
});
