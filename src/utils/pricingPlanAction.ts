import { hasPaidEntitlementStatus } from "./subscriptionStatus";

export type PricingPlanAction =
  | "current_portal"
  | "subscription_portal"
  | "checkout";

export type PricingPlanKey =
  | "free"
  | "starter"
  | "pro"
  | "business"
  | "unlimited_monthly"
  | "unlimited_annual";

type PricingProfile = {
  subscription_tier?: string | null;
  subscription_status?: string | null;
};

export function normalizePricingPlanTier(tier?: string | null): PricingPlanKey {
  const map: Record<string, PricingPlanKey> = {
    unlimited_monthly: "starter",
    unlimited_annual: "starter",
    starter: "starter",
    pro: "pro",
    business: "business",
    free: "free",
  };

  return map[String(tier || "free")] || "free";
}

export function getPricingPlanAction(
  profile: PricingProfile | null | undefined,
  requestedPlan: Exclude<
    PricingPlanKey,
    "unlimited_monthly" | "unlimited_annual"
  >,
): PricingPlanAction {
  const currentTier =
    hasPaidEntitlementStatus(profile?.subscription_status)
      ? normalizePricingPlanTier(profile?.subscription_tier)
      : "free";
  const isActive = hasPaidEntitlementStatus(profile?.subscription_status);

  if (
    isActive &&
    (currentTier === requestedPlan ||
      (currentTier === "starter" && requestedPlan === "starter"))
  ) {
    return "current_portal";
  }

  if (isActive) {
    return "subscription_portal";
  }

  return "checkout";
}
