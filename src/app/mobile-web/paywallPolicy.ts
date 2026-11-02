import { uiText as translateUi } from "./ui";
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
  const uiText = (source: string) => translateUi(source, locale);
  const code = requested || usage.blockedReason;
  const all: MobileBillingTier[] = [
    "starter",
    "pro",
    "business",
    "credit_pack",
  ];
  if (code === "plans" || code === "feature" || code === "credits")
    return {
      title: uiText("Choose a plan"),
      message: uiText("Use your plan in the web app and extension."),
      options: code === "feature" ? ["pro", "business"] : all,
      trust: uiText("Secure checkout by Stripe. Cancel anytime."),
    };
  if (usage.canGenerate !== false && !requested) return null;
  if (code === "account_paused")
    return {
      title: uiText("Continue with a paid option"),
      message: uiText(
        "Paid plans and credit packs let legitimate sellers continue while support reviews duplicate free-trial issues.",
      ),
      options: all,
      support: true,
      trust: uiText(
        "Secure checkout by Stripe. Contact support if this pause looks wrong.",
      ),
    };
  if (code === "payment_required")
    return {
      title: uiText("Update your payment"),
      message: uiText(
        "Payment failed. Update payment to continue. Your drafts stay saved.",
      ),
      options: ["manage"],
      trust: uiText("Manage your payment securely with Stripe."),
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
      title: uiText("Limit reached"),
      message: uiText(
        "Your listing stays here. Add credits without changing plan.",
      ),
      options: ["credit_pack", "support"],
      trust: uiText("Secure checkout by Stripe. One-time purchase."),
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
            ? uiText("Daily limit reached")
            : uiText("Monthly limit reached"),
        message: uiText(
          "Your listing stays here. Upgrade or top up to continue.",
        ),
        options,
        trust: uiText("Secure checkout by Stripe. Cancel anytime."),
      }
    : null;
}
