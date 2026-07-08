import { afterEach, describe, expect, it } from "vitest";
import {
  CREDIT_PACK_CONFIG,
  FREE_LIFETIME_LIMIT,
  CURRENT_LIMITS_MIN_EXTENSION_VERSION,
  compareSemver,
  getPricingLimitsModeForExtension,
  getPricingLimitsMode,
  getEffectiveTier,
  getCustomBusinessEntitlementForStripePriceId,
  getTierByStripePriceId,
  getNextTier,
  getTierConfigForProfile,
  hasUnlimitedDailyLimit,
} from "../../../utils/tierConfig";

describe("tier entitlements", () => {
  afterEach(() => {
    delete process.env.PRICING_LIMITS_MODE;
    delete process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS;
    delete process.env.CUSTOM_BUSINESS_DAILY_LIMIT;
    delete process.env.CUSTOM_BUSINESS_MONTHLY_LIMIT;
    delete process.env.CUSTOM_BUSINESS_MONTHLY_PRICE_EUR;
  });

  it("defaults to current mode when the env var is missing", () => {
    delete process.env.PRICING_LIMITS_MODE;

    expect(getPricingLimitsMode()).toBe("current");
    expect(
      getTierConfigForProfile({
        subscription_status: "free",
        subscription_tier: "free",
      }).limits,
    ).toMatchObject({
      daily: FREE_LIFETIME_LIMIT,
      monthly: FREE_LIFETIME_LIMIT,
    });
  });

  it("uses extension version gating while global mode is legacy", () => {
    process.env.PRICING_LIMITS_MODE = "legacy";

    expect(getPricingLimitsModeForExtension()).toBe("legacy");
    expect(getPricingLimitsModeForExtension("1.3.11")).toBe("legacy");
    expect(getPricingLimitsModeForExtension("1.3.12")).toBe("legacy");
    expect(
      getPricingLimitsModeForExtension(CURRENT_LIMITS_MIN_EXTENSION_VERSION),
    ).toBe("current");
    expect(getPricingLimitsModeForExtension("1.3.13")).toBe("current");
  });

  it("lets global current mode override missing or old extension versions", () => {
    process.env.PRICING_LIMITS_MODE = "current";

    expect(getPricingLimitsModeForExtension()).toBe("current");
    expect(getPricingLimitsModeForExtension("1.0.0")).toBe("current");
  });

  it("compares semantic versions numerically", () => {
    expect(compareSemver("1.3.12", "1.3.9")).toBe(1);
    expect(compareSemver("1.3.12", "1.3.12")).toBe(0);
    expect(compareSemver("1.3.11", "1.3.12")).toBe(-1);
  });

  it("keeps canceled or inactive paid profiles on free entitlements", () => {
    process.env.PRICING_LIMITS_MODE = "current";

    expect(
      getEffectiveTier({
        subscription_status: "canceled",
        subscription_tier: "pro",
      }),
    ).toBe("free");

    expect(
      getTierConfigForProfile({
        subscription_status: "canceled",
        subscription_tier: "pro",
      }).limits,
    ).toMatchObject({
      daily: FREE_LIFETIME_LIMIT,
      monthly: FREE_LIFETIME_LIMIT,
    });
  });

  it("keeps canceling paid profiles on paid entitlements until Stripe deletes them", () => {
    process.env.PRICING_LIMITS_MODE = "current";

    expect(
      getEffectiveTier({
        subscription_status: "canceling",
        subscription_tier: "pro",
      }),
    ).toBe("pro");

    expect(
      getTierConfigForProfile({
        subscription_status: "canceling",
        subscription_tier: "pro",
        is_legacy_plan: false,
      }).limits,
    ).toMatchObject({ daily: 25, monthly: 250 });
  });

  it("uses current lower limits for new active subscriptions", () => {
    process.env.PRICING_LIMITS_MODE = "current";

    expect(
      getTierConfigForProfile({
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: false,
      }).limits,
    ).toMatchObject({ daily: 10, monthly: 75 });

    expect(
      getTierConfigForProfile({
        subscription_status: "active",
        subscription_tier: "business",
        is_legacy_plan: false,
      }).limits,
    ).toMatchObject({ daily: 60, monthly: 600 });
  });

  it("preserves old limits for active legacy subscriptions only", () => {
    process.env.PRICING_LIMITS_MODE = "current";

    expect(
      getTierConfigForProfile({
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: true,
      }).limits,
    ).toMatchObject({ daily: 15, monthly: 300 });

    expect(
      getTierConfigForProfile({
        subscription_status: "active",
        subscription_tier: "business",
        is_legacy_plan: true,
      }).limits,
    ).toMatchObject({ daily: 75, monthly: 1500 });

    expect(
      hasUnlimitedDailyLimit(
        {
          subscription_status: "active",
          subscription_tier: "business",
          is_legacy_plan: true,
        },
        "current",
      ),
    ).toBe(true);
  });

  it("keeps every tier on old limits in legacy compatibility mode", () => {
    process.env.PRICING_LIMITS_MODE = "legacy";

    expect(
      getTierConfigForProfile({
        subscription_status: "active",
        subscription_tier: "starter",
        is_legacy_plan: false,
      }).limits,
    ).toMatchObject({ daily: 15, monthly: 300 });

    expect(
      getTierConfigForProfile({
        subscription_status: "active",
        subscription_tier: "business",
        is_legacy_plan: false,
      }).limits,
    ).toMatchObject({ daily: 75, monthly: 1500 });
  });

  it("keeps the intended upgrade ladder and credit-pack offer", () => {
    expect(getNextTier("free")).toBe("starter");
    expect(getNextTier("starter")).toBe("pro");
    expect(getNextTier("pro")).toBe("business");
    expect(getNextTier("business")).toBeNull();

    expect(CREDIT_PACK_CONFIG).toMatchObject({
      id: "credits_20",
      credits: 20,
      priceEur: 5.99,
    });
  });

  it("maps configured custom Business Stripe prices to Business entitlements", () => {
    process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS =
      "price_custom_business_34_99";
    process.env.CUSTOM_BUSINESS_DAILY_LIMIT = "100";
    process.env.CUSTOM_BUSINESS_MONTHLY_LIMIT = "1000";
    process.env.CUSTOM_BUSINESS_MONTHLY_PRICE_EUR = "34.99";

    expect(getTierByStripePriceId("price_custom_business_34_99")?.id).toBe(
      "business",
    );
    expect(
      getCustomBusinessEntitlementForStripePriceId(
        "price_custom_business_34_99",
      ),
    ).toMatchObject({
      tier: "business",
      monthlyPriceEur: 34.99,
      dailyLimit: 100,
      monthlyLimit: 1000,
    });
  });
});
