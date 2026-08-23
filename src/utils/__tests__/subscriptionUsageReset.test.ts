import { describe, expect, it } from "vitest";
import { buildSubscriptionProfileUpdate } from "../subscriptionUsageReset";

describe("buildSubscriptionProfileUpdate", () => {
  it("leaves usage untouched when a free profile becomes paid", () => {
    expect(
      buildSubscriptionProfileUpdate({
        subscriptionId: "sub_new",
        stripeCustomerId: "cus_123",
        status: "active",
        tier: "starter",
        currentPeriodEnd: "2026-07-21T00:00:00.000Z",
        isLegacyPlan: false,
      }),
    ).toEqual({
      stripe_subscription_id: "sub_new",
      stripe_customer_id: "cus_123",
      subscription_tier: "starter",
      subscription_status: "active",
      current_period_end: "2026-07-21T00:00:00.000Z",
      is_legacy_plan: false,
      account_status: "active",
      abuse_reason: null,
      abuse_notes: null,
      paused_at: null,
      paused_by: null,
    });
  });

  it("does not include reset fields for routine same-subscription updates", () => {
    expect(
      buildSubscriptionProfileUpdate({
        subscriptionId: "sub_current",
        status: "active",
        tier: "pro",
        currentPeriodEnd: "2026-07-21T00:00:00.000Z",
        isLegacyPlan: false,
      }),
    ).toEqual({
      stripe_subscription_id: "sub_current",
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
  });

  it("leaves usage untouched when Stripe assigns a new subscription id", () => {
    expect(
      buildSubscriptionProfileUpdate({
        subscriptionId: "sub_new",
        status: "active",
        tier: "starter",
        currentPeriodEnd: null,
        isLegacyPlan: true,
      }),
    ).toEqual({
      stripe_subscription_id: "sub_new",
      subscription_tier: "starter",
      subscription_status: "active",
      current_period_end: null,
      is_legacy_plan: true,
      account_status: "active",
      abuse_reason: null,
      abuse_notes: null,
      paused_at: null,
      paused_by: null,
    });
  });

  it("does not reset usage when a recovered payment returns past due to active", () => {
    const update = buildSubscriptionProfileUpdate({
      subscriptionId: "sub_current",
      status: "active",
      tier: "starter",
      currentPeriodEnd: "2026-09-21T00:00:00.000Z",
      isLegacyPlan: false,
    });

    expect(update).not.toHaveProperty("api_calls_this_month");
    expect(update).not.toHaveProperty("last_api_call_reset");
  });
});
