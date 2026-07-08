export type SubscriptionStatusLike = string | null | undefined;

export function isActiveSubscriptionStatus(status: SubscriptionStatusLike) {
  return status === "active" || status === "trialing";
}

export function isCancelingSubscriptionStatus(status: SubscriptionStatusLike) {
  return status === "canceling";
}

export function hasPaidEntitlementStatus(status: SubscriptionStatusLike) {
  return (
    isActiveSubscriptionStatus(status) || isCancelingSubscriptionStatus(status)
  );
}

export function mapStripeSubscriptionStatusForProfile(
  subscription: {
    status?: string | null;
    cancel_at_period_end?: boolean | null;
  },
  tier?: string | null,
) {
  if (!tier || tier === "free") {
    return "free";
  }

  const status = subscription.status || "incomplete";
  if (status === "active" && subscription.cancel_at_period_end) {
    return "canceling";
  }

  return status;
}
