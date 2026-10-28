import { describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {},
}));

vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return {};
  }),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: vi.fn() } };
  }),
}));

import { getWelcomeBillingDetails } from "../../../api/stripe/webhook";

describe("Stripe welcome billing details", () => {
  it("retains a discounted contract confirmation after immediate cancellation without a statement name", () => {
    const result = getWelcomeBillingDetails({
      status: "canceled",
      subscription: {
        status: "canceled",
        canceled_at: 1793192400,
        discounts: [{ coupon: { percent_off: 20, duration: "once" } }],
        items: {
          data: [
            {
              quantity: 1,
              price: {
                unit_amount: 999,
                currency: "eur",
                recurring: { interval: "month", interval_count: 1 },
              },
            },
          ],
        },
      },
      checkoutSession: {
        metadata: { billing_policy_version: "2026-10-28" },
        amount_total: 799,
        currency: "eur",
        total_details: { amount_discount: 200 },
      },
    });
    expect(result).toMatchObject({
      initialCharge: { amountMinor: 799, currency: "eur" },
      recurringBase: { amountMinor: 999, currency: "eur" },
      renewalStopped: true,
      statementDescriptor: null,
      policyVersion: "2026-10-28",
    });
  });
  it("separates a localized introductory payment from the base monthly price and discount duration", () => {
    const result = getWelcomeBillingDetails({
      status: "active",
      subscription: {
        discounts: [{ coupon: { percent_off: 20, duration: "once" } }],
        items: {
          data: [
            {
              quantity: 1,
              price: {
                unit_amount: 999,
                currency: "eur",
                recurring: { interval: "month", interval_count: 1 },
              },
              current_period_end: 1784592000,
            },
          ],
        },
      },
      checkoutSession: {
        metadata: { billing_policy_version: "2026-10-28" },
        amount_total: 799,
        currency: "eur",
        presentment_details: {
          presentment_amount: 704,
          presentment_currency: "gbp",
        },
        total_details: { amount_discount: 200 },
      },
    });
    expect(result).toMatchObject({
      amountMinor: null,
      initialCharge: { amountMinor: 704, currency: "gbp" },
      recurringBase: { amountMinor: 999, currency: "eur" },
      discountDescription: "20% off the first invoice.",
    });
  });
  it("prefers the checkout amount and currency for an active subscription", () => {
    expect(
      getWelcomeBillingDetails({
        status: "active",
        subscription: {
          items: {
            data: [
              {
                price: { unit_amount: 399, currency: "eur" },
                current_period_end: 1784592000,
              },
            ],
          },
        },
        checkoutSession: {
          amount_total: 1999,
          currency: "usd",
        },
      }),
    ).toEqual({
      amountMinor: 1999,
      currency: "usd",
      nextRenewalAt: "2026-07-21T00:00:00.000Z",
      statementDescriptor: null,
      source: "checkout",
    });
  });

  it("uses the customer-facing presentment pair for Adaptive Pricing", () => {
    expect(
      getWelcomeBillingDetails({
        status: "active",
        subscription: {
          items: {
            data: [
              {
                price: { unit_amount: 399, currency: "eur" },
                current_period_end: 1784592000,
              },
            ],
          },
        },
        checkoutSession: {
          amount_total: 1999,
          currency: "eur",
          presentment_details: {
            presentment_amount: 2199,
            presentment_currency: "usd",
          },
        },
      }),
    ).toEqual({
      amountMinor: 2199,
      currency: "usd",
      nextRenewalAt: "2026-07-21T00:00:00.000Z",
      statementDescriptor: null,
      source: "checkout",
    });
  });

  it("omits the recurring amount when Stripe reports a discount", () => {
    expect(
      getWelcomeBillingDetails({
        status: "active",
        subscription: {
          discount: { coupon: { id: "coupon_123" } },
          items: {
            data: [
              {
                price: { unit_amount: 1999, currency: "eur" },
                current_period_end: 1784592000,
              },
            ],
          },
        },
      }),
    ).toEqual({
      amountMinor: null,
      currency: null,
      nextRenewalAt: "2026-07-21T00:00:00.000Z",
      statementDescriptor: null,
      source: undefined,
    });
  });

  it("omits billing claims for trials and subscriptions ending at period end", () => {
    expect(
      getWelcomeBillingDetails({
        status: "trialing",
        subscription: { current_period_end: 1784592000 },
      }),
    ).toBeUndefined();

    expect(
      getWelcomeBillingDetails({
        status: "active",
        subscription: {
          cancel_at_period_end: true,
          current_period_end: 1784592000,
          items: {
            data: [{ price: { unit_amount: 1999, currency: "eur" } }],
          },
        },
      }),
    ).toBeUndefined();
  });
});
