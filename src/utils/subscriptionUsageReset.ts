import { hasPaidEntitlementStatus } from "./subscriptionStatus";

export type SubscriptionProfileUpdateInput = {
  subscriptionId: string;
  status: string;
  tier: string;
  currentPeriodEnd: string | null;
  stripeCustomerId?: string | null;
  isLegacyPlan: boolean;
};

function isActivePaid(status?: string | null, tier?: string | null) {
  return hasPaidEntitlementStatus(status) && tier !== "free";
}

function clearPauseFields(updateData: Record<string, unknown>) {
  updateData.account_status = "active";
  updateData.abuse_reason = null;
  updateData.abuse_notes = null;
  updateData.paused_at = null;
  updateData.paused_by = null;
}

export function buildSubscriptionProfileUpdate(
  input: SubscriptionProfileUpdateInput,
) {
  const updateData: Record<string, unknown> = {
    stripe_subscription_id: input.subscriptionId,
    subscription_tier: input.tier,
    subscription_status: input.status,
    current_period_end: input.currentPeriodEnd,
    is_legacy_plan: input.isLegacyPlan,
  };

  if (input.stripeCustomerId) {
    updateData.stripe_customer_id = input.stripeCustomerId;
  }

  if (isActivePaid(input.status, input.tier)) {
    clearPauseFields(updateData);
  }

  return updateData;
}
