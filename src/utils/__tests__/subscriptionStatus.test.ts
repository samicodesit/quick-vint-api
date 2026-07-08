import { describe, expect, it } from "vitest";
import {
  hasPaidEntitlementStatus,
  mapStripeSubscriptionStatusForProfile,
} from "../subscriptionStatus";

describe("subscription status normalization", () => {
  it("keeps scheduled paid cancellations separate from active subscribers", () => {
    expect(
      mapStripeSubscriptionStatusForProfile(
        { status: "active", cancel_at_period_end: true },
        "starter",
      ),
    ).toBe("canceling");
  });

  it("normalizes legacy Stripe Free Trial subscriptions to free internally", () => {
    expect(
      mapStripeSubscriptionStatusForProfile(
        { status: "active", cancel_at_period_end: false },
        "free",
      ),
    ).toBe("free");
  });

  it("treats canceling paid users as entitled until Stripe deletion arrives", () => {
    expect(hasPaidEntitlementStatus("canceling")).toBe(true);
  });
});
