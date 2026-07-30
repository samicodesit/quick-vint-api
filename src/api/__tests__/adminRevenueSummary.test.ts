import { describe, expect, it, vi } from "vitest";
import { buildStripeRevenueSummaryFromSubscriptions } from "../../../api/admin/index";

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {},
}));

vi.mock("resend", () => ({
  Resend: vi.fn(
    class {
      emails = { send: vi.fn() };
    },
  ),
}));

describe("admin revenue summary", () => {
  it("uses actual Stripe subscription item prices for MRR", () => {
    process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS =
      "price_custom_business_34_99";

    const profileEstimate = {
      estimatedMrrEur: 355.56,
      activePaidUsers: 44,
      currency: "EUR",
      source: "profile_plan_list_price",
      byTier: [],
    };

    const summary = buildStripeRevenueSummaryFromSubscriptions(
      [
        {
          id: "sub_monthly_custom",
          status: "active",
          items: {
            data: [
              {
                quantity: 1,
                price: {
                  id: "price_custom_business_34_99",
                  currency: "eur",
                  unit_amount: 3499,
                  recurring: { interval: "month", interval_count: 1 },
                },
              },
            ],
          },
        },
        {
          id: "sub_annual",
          status: "active",
          items: {
            data: [
              {
                quantity: 1,
                price: {
                  id: "price_annual_pro",
                  currency: "eur",
                  unit_amount: 11988,
                  recurring: { interval: "year", interval_count: 1 },
                },
              },
            ],
          },
        },
      ],
      profileEstimate,
    );

    expect(summary.source).toBe("stripe_subscription_items");
    expect(summary.estimatedMrrEur).toBeCloseTo(44.98, 2);
    expect(summary.activePaidUsers).toBe(2);
    expect(summary.profileEstimateMrrEur).toBe(355.56);
    expect(summary.byTier).toEqual([
      { tier: "business", count: 1, monthlyRevenueEur: 34.99 },
      { tier: "unknown", count: 1, monthlyRevenueEur: 9.99 },
    ]);
  });
});
