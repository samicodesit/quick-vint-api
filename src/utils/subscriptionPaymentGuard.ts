import { getInvoiceSubscriptionId } from "./subscriptionInvoice";

export type PaidProfileSnapshot = {
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
  last_usage_period_end?: string | null;
  is_legacy_plan?: boolean | null;
  paid_access_expires_at?: string | null;
};

/** Preserve the previous paid entitlement while a plan-change invoice is unpaid.
 * Returning a small replacement also avoids clearing pauses or custom limits.
 */
export function getUnpaidPlanChangeUpdate(
  profile: PaidProfileSnapshot,
  subscription: { id: string; status?: string; cancel_at_period_end?: boolean },
  invoice: any,
  now = Date.now(),
): Record<string, unknown> | null {
  if (
    profile.stripe_subscription_id !== subscription.id ||
    !profile.subscription_tier ||
    profile.subscription_tier === "free" ||
    invoice?.billing_reason !== "subscription_update" ||
    invoice.status === "paid"
  )
    return null;
  if (getInvoiceSubscriptionId(invoice) !== subscription.id) {
    throw new Error("Plan-change invoice does not match subscription");
  }
  const invoiceCustomer =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (
    profile.stripe_customer_id &&
    invoiceCustomer !== profile.stripe_customer_id
  ) {
    throw new Error("Plan-change invoice does not match customer");
  }
  const paidThrough = Math.min(
    Date.parse(profile.last_usage_period_end || ""),
    Date.parse(profile.current_period_end || ""),
  );
  const keepPaidAccess =
    Number.isFinite(paidThrough) &&
    paidThrough > now &&
    ["active", "canceling"].includes(profile.subscription_status || "") &&
    ["active", "past_due"].includes(subscription.status || "");
  return {
    subscription_tier: profile.subscription_tier,
    subscription_status: keepPaidAccess
      ? subscription.cancel_at_period_end
        ? "canceling"
        : "active"
      : ["canceled", "incomplete_expired"].includes(subscription.status || "")
        ? subscription.status
        : "past_due",
    current_period_end: profile.current_period_end,
    paid_access_expires_at: Number.isFinite(paidThrough)
      ? new Date(paidThrough).toISOString()
      : new Date(now).toISOString(),
    is_legacy_plan: Boolean(profile.is_legacy_plan),
  };
}
