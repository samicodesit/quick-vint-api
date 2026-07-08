import { hasPaidEntitlementStatus } from "./subscriptionStatus";

export type SubscriptionUsageProfile = {
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  subscription_tier?: string | null;
};

export type SubscriptionProfileUpdateInput = {
  subscriptionId: string;
  status: string;
  tier: string;
  currentPeriodEnd: string | null;
  stripeCustomerId?: string | null;
  isLegacyPlan: boolean;
  resetAt?: string;
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

export function shouldResetMonthlyUsageForSubscriptionActivation(
  existingProfile: SubscriptionUsageProfile | null | undefined,
  incoming: { subscriptionId: string; status: string; tier: string },
) {
  if (!isActivePaid(incoming.status, incoming.tier)) return false;

  const wasActivePaid = isActivePaid(
    existingProfile?.subscription_status,
    existingProfile?.subscription_tier,
  );

  if (!wasActivePaid) return true;

  return existingProfile?.stripe_subscription_id !== incoming.subscriptionId;
}

export function buildSubscriptionProfileUpdate(
  existingProfile: SubscriptionUsageProfile | null | undefined,
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

  if (
    shouldResetMonthlyUsageForSubscriptionActivation(existingProfile, {
      subscriptionId: input.subscriptionId,
      status: input.status,
      tier: input.tier,
    })
  ) {
    updateData.api_calls_this_month = 0;
    updateData.last_api_call_reset = input.resetAt || new Date().toISOString();
  }

  if (isActivePaid(input.status, input.tier)) {
    clearPauseFields(updateData);
  }

  return updateData;
}
