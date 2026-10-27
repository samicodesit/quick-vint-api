import type { MobileUsage } from "./generationClient";
import type { MobileBillingTier } from "./billing";
import { getBillingCopy } from "../../utils/billingDisplay";
import { FREE_LIFETIME_LIMIT } from "../../../utils/tierConfig";

export interface MobilePaywall {
  title: string;
  message: string;
  options: Array<MobileBillingTier | "manage" | "support">;
  trust: string;
  support?: boolean;
}

/** Matches content.js buildLimitMessage and showAccountPausedPaywall. */
export function getMobilePaywall(
  usage: MobileUsage,
  requested?: string,
  locale = "en",
): MobilePaywall | null {
  const code = requested || usage.blockedReason;
  const all: MobileBillingTier[] = [
    "starter",
    "pro",
    "business",
    "credit_pack",
  ];
  if (code === "plans" || code === "feature" || code === "credits")
    return {
      title: "Choose a plan",
      message: "Use your plan in the web app and extension.",
      options: code === "feature" ? ["pro", "business"] : all,
      trust: "Secure checkout by Stripe. Cancel anytime.",
    };
  if (usage.canGenerate !== false && !requested) return null;
  if (code === "account_paused")
    return {
      title: "Continue with a paid option",
      message:
        "Paid plans and credit packs let legitimate sellers continue while support reviews duplicate free-trial issues.",
      options: all,
      support: true,
      trust:
        "Secure checkout by Stripe. Contact support if this pause looks wrong.",
    };
  if (code === "payment_required")
    return {
      title: "Update your payment",
      message:
        "Payment failed. Update payment to continue. Your drafts stay saved.",
      options: ["manage"],
      trust: "Manage your payment securely with Stripe.",
      support: true,
    };
  if (code === "free_lifetime_limit") {
    const copy = getBillingCopy(locale);
    return {
      title: copy.freeLimitTitle.replace(
        "{limit}",
        String(FREE_LIFETIME_LIMIT),
      ),
      message: copy.freeLimitMessage,
      options: all,
      trust: copy.subscriptionTrust,
    };
  }
  if (code !== "daily_limit" && code !== "monthly_limit") return null;
  const tier = usage.plan?.tier;
  if (tier === "business")
    return {
      title: "Limit reached",
      message: "Your listing stays here. Add credits without changing plan.",
      options: ["credit_pack", "support"],
      trust: "Secure checkout by Stripe. One-time purchase.",
    };
  const options: MobilePaywall["options"] =
    tier === "starter" ||
    tier === "unlimited_monthly" ||
    tier === "unlimited_annual"
      ? ["pro", "business", "credit_pack"]
      : tier === "pro"
        ? ["business", "credit_pack"]
        : tier === "free" && usage.nextTier === "starter"
          ? ["starter"]
          : [];
  return options.length
    ? {
        title:
          code === "daily_limit"
            ? "Daily limit reached"
            : "Monthly limit reached",
        message: "Your listing stays here. Upgrade or top up to continue.",
        options,
        trust: "Secure checkout by Stripe. Cancel anytime.",
      }
    : null;
}
