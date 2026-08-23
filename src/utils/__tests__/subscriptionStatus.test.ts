import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("keeps paid entitlement only during Stripe's retryable past-due state", () => {
    expect(hasPaidEntitlementStatus("past_due")).toBe(true);
    expect(hasPaidEntitlementStatus("unpaid")).toBe(false);
    expect(hasPaidEntitlementStatus("canceled")).toBe(false);
  });

  it("keeps the pricing page on the shared entitlement definition", () => {
    const pricingScript = readFileSync(
      join(process.cwd(), "src/scripts/pricing.js"),
      "utf8",
    );

    expect(pricingScript).toContain('from "../utils/subscriptionStatus.ts"');
    expect(pricingScript).not.toContain("function hasPaidEntitlementStatus(");
  });
});
