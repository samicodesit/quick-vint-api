import { describe, expect, it } from "vitest";
import { getPricingPlanAction } from "../pricingPlanAction";

describe("pricing plan action", () => {
  it("routes active Starter users who click Pro to the subscription portal", () => {
    expect(
      getPricingPlanAction(
        {
          subscription_tier: "starter",
          subscription_status: "active",
        },
        "pro",
      ),
    ).toBe("subscription_portal");
  });

  it("routes free users who click Pro to Checkout", () => {
    expect(
      getPricingPlanAction(
        {
          subscription_tier: "free",
          subscription_status: "free",
        },
        "pro",
      ),
    ).toBe("checkout");
  });

  it("routes active Starter users who click Starter to portal management", () => {
    expect(
      getPricingPlanAction(
        {
          subscription_tier: "starter",
          subscription_status: "active",
        },
        "starter",
      ),
    ).toBe("current_portal");
  });
});
