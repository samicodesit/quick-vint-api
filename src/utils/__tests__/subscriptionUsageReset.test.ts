import { describe, expect, it } from "vitest";
import {
  buildSubscriptionProfileUpdate,
  shouldResetMonthlyUsageForSubscriptionActivation,
} from "../subscriptionUsageReset";

describe("shouldResetMonthlyUsageForSubscriptionActivation", () => {
  it("resets when a free user starts a paid active subscription", () => {
    expect(
      shouldResetMonthlyUsageForSubscriptionActivation(
        {
          stripe_subscription_id: null,
          subscription_status: "free",
          subscription_tier: "free",
        },
        {
          subscriptionId: "sub_new",
          status: "active",
          tier: "starter",
        },
      ),
    ).toBe(true);
  });

  it("does not reset repeated updates for the same active subscription", () => {
    expect(
      shouldResetMonthlyUsageForSubscriptionActivation(
        {
          stripe_subscription_id: "sub_current",
          subscription_status: "active",
          subscription_tier: "starter",
        },
        {
          subscriptionId: "sub_current",
          status: "active",
          tier: "starter",
        },
      ),
    ).toBe(false);
  });

  it("resets when a canceled user starts a new paid subscription", () => {
    expect(
      shouldResetMonthlyUsageForSubscriptionActivation(
        {
          stripe_subscription_id: "sub_old",
          subscription_status: "canceled",
          subscription_tier: "free",
        },
        {
          subscriptionId: "sub_new",
          status: "active",
          tier: "pro",
        },
      ),
    ).toBe(true);
  });

  it("resets when an active paid profile gets a different subscription id", () => {
    expect(
      shouldResetMonthlyUsageForSubscriptionActivation(
        {
          stripe_subscription_id: "sub_old",
          subscription_status: "active",
          subscription_tier: "starter",
        },
        {
          subscriptionId: "sub_new",
          status: "active",
          tier: "starter",
        },
      ),
    ).toBe(true);
  });

  it("does not reset for inactive or free incoming subscription states", () => {
    expect(
      shouldResetMonthlyUsageForSubscriptionActivation(
        {
          stripe_subscription_id: null,
          subscription_status: "free",
          subscription_tier: "free",
        },
        {
          subscriptionId: "sub_new",
          status: "incomplete",
          tier: "starter",
        },
      ),
    ).toBe(false);

    expect(
      shouldResetMonthlyUsageForSubscriptionActivation(
        {
          stripe_subscription_id: null,
          subscription_status: "free",
          subscription_tier: "free",
        },
        {
          subscriptionId: "sub_new",
          status: "active",
          tier: "free",
        },
      ),
    ).toBe(false);
  });
});

describe("buildSubscriptionProfileUpdate", () => {
  it("includes monthly reset fields for a free-to-paid activation", () => {
    expect(
      buildSubscriptionProfileUpdate(
        {
          stripe_subscription_id: null,
          subscription_status: "free",
          subscription_tier: "free",
        },
        {
          subscriptionId: "sub_new",
          stripeCustomerId: "cus_123",
          status: "active",
          tier: "starter",
          currentPeriodEnd: "2026-07-21T00:00:00.000Z",
          isLegacyPlan: false,
          resetAt: "2026-06-21T10:00:00.000Z",
        },
      ),
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
      api_calls_this_month: 0,
      last_api_call_reset: "2026-06-21T10:00:00.000Z",
    });
  });

  it("does not include reset fields for routine same-subscription updates", () => {
    expect(
      buildSubscriptionProfileUpdate(
        {
          stripe_subscription_id: "sub_current",
          subscription_status: "active",
          subscription_tier: "starter",
        },
        {
          subscriptionId: "sub_current",
          status: "active",
          tier: "pro",
          currentPeriodEnd: "2026-07-21T00:00:00.000Z",
          isLegacyPlan: false,
          resetAt: "2026-06-21T10:00:00.000Z",
        },
      ),
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

  it("preserves the legacy flag while still resetting a genuinely new subscription id", () => {
    expect(
      buildSubscriptionProfileUpdate(
        {
          stripe_subscription_id: "sub_old",
          subscription_status: "active",
          subscription_tier: "starter",
        },
        {
          subscriptionId: "sub_new",
          status: "active",
          tier: "starter",
          currentPeriodEnd: null,
          isLegacyPlan: true,
          resetAt: "2026-06-21T10:00:00.000Z",
        },
      ),
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
      api_calls_this_month: 0,
      last_api_call_reset: "2026-06-21T10:00:00.000Z",
    });
  });
});
