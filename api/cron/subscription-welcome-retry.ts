import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { getCustomBusinessEntitlementForStripePriceId } from "../../utils/tierConfig";
import { sendSubscriptionWelcomeEmailOnce } from "../../utils/subscriptionWelcomeEmail";
import {
  hasCustomerFacingWelcomeBilling,
  isSendableWelcomeSubscription,
  resolveWelcomeBillingDetails,
} from "../../utils/subscriptionWelcomeBilling";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

type WelcomeEmailRow = {
  user_id: string;
  email: string;
  tier: string;
  stripe_subscription_id: string;
  stripe_checkout_session_id: string | null;
};

async function fetchRetryRows(nowIso: string) {
  const [dueRows, expiredSendingRows] = await Promise.all([
    supabase
      .from("subscription_welcome_emails")
      .select(
        "user_id,email,tier,stripe_subscription_id,stripe_checkout_session_id",
      )
      .in("status", ["pending", "failed"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("subscription_welcome_emails")
      .select(
        "user_id,email,tier,stripe_subscription_id,stripe_checkout_session_id",
      )
      .eq("status", "sending")
      .lt("locked_until", nowIso)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  if (dueRows.error) throw dueRows.error;
  if (expiredSendingRows.error) throw expiredSendingRows.error;

  const bySubscription = new Map<string, WelcomeEmailRow>();
  for (const row of [
    ...((dueRows.data || []) as WelcomeEmailRow[]),
    ...((expiredSendingRows.data || []) as WelcomeEmailRow[]),
  ]) {
    bySubscription.set(`${row.stripe_subscription_id}:${row.tier}`, row);
  }

  return Array.from(bySubscription.values()).slice(0, 20);
}

async function getRetryBillingContext(row: WelcomeEmailRow) {
  const subscription = (await stripe.subscriptions.retrieve(
    row.stripe_subscription_id,
  )) as any;

  if (!isSendableWelcomeSubscription(subscription)) {
    return {
      subscription,
      billing: undefined,
      isLegacyPlan: null,
      customLimits: null,
      isCustomPlan: false,
    };
  }

  const checkoutSession = row.stripe_checkout_session_id
    ? await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id)
    : undefined;
  const billing = await resolveWelcomeBillingDetails({
    stripe,
    subscription,
    status: subscription.status,
    checkoutSession,
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_legacy_plan,custom_daily_limit,custom_monthly_limit")
    .eq("id", row.user_id)
    .maybeSingle();
  if (profileError) throw profileError;

  const priceId = subscription?.items?.data?.[0]?.price?.id;
  const configuredCustomEntitlement =
    getCustomBusinessEntitlementForStripePriceId(priceId);
  const profileDailyLimit =
    typeof profile?.custom_daily_limit === "number" &&
    profile.custom_daily_limit > 0
      ? profile.custom_daily_limit
      : null;
  const profileMonthlyLimit =
    typeof profile?.custom_monthly_limit === "number" &&
    profile.custom_monthly_limit > 0
      ? profile.custom_monthly_limit
      : null;
  const customLimits =
    row.tier === "business" &&
    (profileDailyLimit !== null || profileMonthlyLimit !== null)
      ? {
          daily:
            profileDailyLimit ?? configuredCustomEntitlement?.dailyLimit ?? 0,
          monthly:
            profileMonthlyLimit ??
            configuredCustomEntitlement?.monthlyLimit ??
            0,
        }
      : configuredCustomEntitlement
        ? {
            daily: configuredCustomEntitlement.dailyLimit,
            monthly: configuredCustomEntitlement.monthlyLimit,
          }
        : null;

  return {
    subscription,
    billing,
    isLegacyPlan: profile?.is_legacy_plan ?? null,
    customLimits,
    isCustomPlan: Boolean(
      configuredCustomEntitlement ||
      (row.tier === "business" &&
        (profileDailyLimit !== null || profileMonthlyLimit !== null)),
    ),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rows = await fetchRetryRows(new Date().toISOString());
    const results = [];

    for (const row of rows) {
      try {
        const context = await getRetryBillingContext(row);
        if (!isSendableWelcomeSubscription(context.subscription)) {
          results.push({
            email: row.email,
            stripeSubscriptionId: row.stripe_subscription_id,
            status:
              context.subscription.status === "canceled" ||
              context.subscription.cancel_at_period_end === true
                ? "skipped"
                : "deferred",
          });
          continue;
        }
        if (!hasCustomerFacingWelcomeBilling(context.billing)) {
          results.push({
            email: row.email,
            stripeSubscriptionId: row.stripe_subscription_id,
            status: "deferred",
          });
          continue;
        }

        const result = await sendSubscriptionWelcomeEmailOnce({
          profileId: row.user_id,
          email: row.email,
          tier: row.tier,
          stripeSubscriptionId: row.stripe_subscription_id,
          stripeCheckoutSessionId: row.stripe_checkout_session_id,
          isLegacyPlan: context.isLegacyPlan,
          billing: context.billing,
          limits: context.customLimits,
          isCustomPlan: context.isCustomPlan,
        });
        results.push({
          email: row.email,
          stripeSubscriptionId: row.stripe_subscription_id,
          status: result.status,
        });
      } catch (error) {
        const isMissingStripeResource =
          (error as { code?: string } | null)?.code === "resource_missing";
        console.error("Subscription welcome retry row failed:", {
          email: row.email,
          stripeSubscriptionId: row.stripe_subscription_id,
          error,
        });
        results.push({
          email: row.email,
          stripeSubscriptionId: row.stripe_subscription_id,
          status: isMissingStripeResource ? "skipped" : "failed",
        });
      }
    }

    return res.status(200).json({
      ok: true,
      checked: rows.length,
      results,
    });
  } catch (error: any) {
    console.error("Subscription welcome retry failed:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
