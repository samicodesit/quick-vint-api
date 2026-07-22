import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import {
  getBillingDriftReasons,
  logBillingEvent,
} from "../../utils/billingEvents";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const ACTIVE_LIKE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

type BillingProfile = {
  id: string;
  email: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function hasBillingRisk(profile: BillingProfile) {
  return (
    Boolean(profile.stripe_customer_id) ||
    (profile.subscription_tier && profile.subscription_tier !== "free") ||
    ["active", "trialing", "past_due", "unpaid", "canceling"].includes(
      profile.subscription_status || "",
    )
  );
}

async function getStripeSnapshot(customerId: string) {
  const [subscriptions, invoices] = await Promise.all([
    stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    }),
    stripe.invoices.list({
      customer: customerId,
      limit: 100,
    }),
  ]);

  const activeLikeSubscriptions = subscriptions.data.filter((subscription) =>
    ACTIVE_LIKE_SUBSCRIPTION_STATUSES.has(subscription.status),
  );
  const collectibleInvoices = invoices.data.filter(
    (invoice) =>
      invoice.status === "open" && Number(invoice.amount_remaining || 0) > 0,
  );

  return {
    activeLikeSubscriptionCount: activeLikeSubscriptions.length,
    collectibleInvoiceCount: collectibleInvoices.length,
    collectibleAmountRemaining: collectibleInvoices.reduce(
      (total, invoice) => total + Number(invoice.amount_remaining || 0),
      0,
    ),
    hasCancelAtPeriodEnd: activeLikeSubscriptions.some(
      (subscription) => subscription.cancel_at_period_end,
    ),
    subscriptions: activeLikeSubscriptions.map((subscription) => ({
      id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
    })),
    invoices: collectibleInvoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      amount_remaining: invoice.amount_remaining,
      currency: invoice.currency,
      next_payment_attempt: invoice.next_payment_attempt || null,
    })),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,email,subscription_status,subscription_tier,stripe_customer_id,stripe_subscription_id",
    )
    .limit(1000);

  if (error) {
    console.error("Billing reconciliation profile query failed:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  const profiles = ((data || []) as BillingProfile[]).filter(hasBillingRisk);
  const mismatches = [];

  for (const profile of profiles) {
    if (!profile.stripe_customer_id) {
      if (profile.subscription_tier && profile.subscription_tier !== "free") {
        const reasons = ["paid_profile_missing_stripe_customer_id"];
        mismatches.push({ profile, reasons });
        await logBillingEvent({
          user_id: profile.id,
          user_email: profile.email,
          source: "reconciliation",
          event_type: "billing.reconciliation_mismatch",
          drift_reasons: reasons,
          raw_event: { profile },
        });
      }
      continue;
    }

    const snapshot = await getStripeSnapshot(profile.stripe_customer_id);
    const reasons = getBillingDriftReasons({
      profile,
      stripe: snapshot,
    });

    if (!reasons.length) continue;

    mismatches.push({ profile, reasons, stripe: snapshot });
    await logBillingEvent({
      user_id: profile.id,
      user_email: profile.email,
      source: "reconciliation",
      event_type: "billing.reconciliation_mismatch",
      stripe_customer_id: profile.stripe_customer_id,
      stripe_subscription_id: profile.stripe_subscription_id,
      drift_reasons: reasons,
      raw_event: {
        profile,
        stripe: snapshot,
      },
    });
  }

  return res.status(200).json({
    ok: true,
    checked: profiles.length,
    mismatches: mismatches.length,
    mismatchDetails: mismatches.map((item) => ({
      user_id: item.profile.id,
      user_email: item.profile.email,
      reasons: item.reasons,
    })),
  });
}
