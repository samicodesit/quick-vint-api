import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import {
  getBillingDriftReasons,
  logBillingEvent,
} from "../../utils/billingEvents";
import {
  getInvoiceSubscriptionId,
  getPaidSubscriptionPeriod,
} from "../../src/utils/subscriptionInvoice";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const ACTIVE_LIKE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);
const USAGE_REPAIR_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

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

async function getStripeSnapshot(
  customerId: string,
  currentSubscriptionId: string | null,
) {
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
  const currentSubscription = activeLikeSubscriptions.find(
    (subscription) => subscription.id === currentSubscriptionId,
  );
  let latestPaidUsagePeriod: {
    invoiceId: string;
    subscriptionId: string;
    periodEnd: string;
  } | null = null;

  for (const invoice of invoices.data) {
    if (invoice.status !== "paid") continue;
    const subscriptionId = getInvoiceSubscriptionId(invoice as any);
    if (subscriptionId !== currentSubscriptionId) continue;
    const period = getPaidSubscriptionPeriod(invoice as any);
    if (!invoice.id || !subscriptionId || !period) continue;
    latestPaidUsagePeriod = {
      invoiceId: invoice.id,
      subscriptionId,
      periodEnd: period.end,
    };
    break;
  }

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
    currentSubscriptionStatus: currentSubscription?.status || null,
    latestPaidUsagePeriod,
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
    .or(
      "stripe_customer_id.not.is.null,subscription_tier.neq.free,subscription_status.in.(active,trialing,past_due,unpaid,canceling)",
    )
    .limit(1000);

  if (error) {
    console.error("Billing reconciliation profile query failed");
    reportCriticalEndpointFailure({
      endpoint: "/api/cron/billing-reconciliation",
      status: 500,
      details: { stage: "profile_query" },
    });
    return res.status(500).json({ ok: false, error: "Profile query failed" });
  }

  const profiles = ((data || []) as BillingProfile[]).filter(hasBillingRisk);
  const mismatches = [];
  let usageResets = 0;
  let usageResetErrors = 0;

  // ponytail: sequential snapshots cap Stripe concurrency at two; add
  // cursor-based batches when measured cron duration approaches its limit.
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

    let snapshot;
    try {
      snapshot = await getStripeSnapshot(
        profile.stripe_customer_id,
        profile.stripe_subscription_id,
      );
    } catch {
      reportCriticalEndpointFailure({
        endpoint: "/api/cron/billing-reconciliation",
        status: 500,
        userId: profile.id,
        details: { stage: "stripe_snapshot" },
      });
      return res
        .status(500)
        .json({ ok: false, error: "Stripe reconciliation failed" });
    }

    if (
      snapshot.latestPaidUsagePeriod &&
      USAGE_REPAIR_SUBSCRIPTION_STATUSES.has(
        snapshot.currentSubscriptionStatus || "",
      )
    ) {
      const paidPeriod = snapshot.latestPaidUsagePeriod;
      const { data: resetResult, error: resetError } = await supabase.rpc(
        "reset_monthly_usage_for_paid_invoice",
        {
          p_user_id: profile.id,
          p_stripe_subscription_id: paidPeriod.subscriptionId,
          p_stripe_invoice_id: paidPeriod.invoiceId,
          p_period_end: paidPeriod.periodEnd,
        },
      );

      if (resetError) {
        usageResetErrors += 1;
        await logBillingEvent({
          user_id: profile.id,
          user_email: profile.email,
          source: "reconciliation",
          event_type: "billing.reconciliation_usage_reset_failed",
          stripe_customer_id: profile.stripe_customer_id,
          stripe_subscription_id: paidPeriod.subscriptionId,
          stripe_invoice_id: paidPeriod.invoiceId,
          raw_event: { error: resetError.message || String(resetError) },
        });
      } else if (resetResult?.reset === true) {
        usageResets += 1;
        await logBillingEvent({
          user_id: profile.id,
          user_email: profile.email,
          source: "reconciliation",
          event_type: "billing.reconciliation_usage_reset",
          stripe_customer_id: profile.stripe_customer_id,
          stripe_subscription_id: paidPeriod.subscriptionId,
          stripe_invoice_id: paidPeriod.invoiceId,
          raw_event: { periodEnd: paidPeriod.periodEnd },
        });
      }
    }

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

  // Vercel does not retry failed cron invocations. Preserve a non-2xx status so
  // partial billing repair failures remain visible to monitoring.
  if (mismatches.length || usageResetErrors) {
    const reasonCounts = mismatches.reduce<Record<string, number>>(
      (counts, item) => {
        for (const reason of item.reasons) {
          counts[reason] = (counts[reason] || 0) + 1;
        }
        return counts;
      },
      {},
    );
    reportCriticalEndpointFailure({
      endpoint: "/api/cron/billing-reconciliation",
      status: usageResetErrors ? 500 : 409,
      details: {
        checked: profiles.length,
        mismatches: mismatches.length,
        usageResetErrors,
        reasonCounts,
        sampleUserIds: mismatches.slice(0, 5).map((item) => item.profile.id),
      },
    });
  }

  return res.status(usageResetErrors ? 500 : 200).json({
    ok: usageResetErrors === 0,
    checked: profiles.length,
    mismatches: mismatches.length,
    usageResets,
    usageResetErrors,
    mismatchDetails: mismatches.map((item) => ({
      user_id: item.profile.id,
      user_email: item.profile.email,
      reasons: item.reasons,
    })),
  });
}
