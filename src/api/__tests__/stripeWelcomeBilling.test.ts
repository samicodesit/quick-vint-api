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
      statementDescriptor: "AUTOLISTER AI",
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
      statementDescriptor: "AUTOLISTER AI",
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
      statementDescriptor: "AUTOLISTER AI",
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
