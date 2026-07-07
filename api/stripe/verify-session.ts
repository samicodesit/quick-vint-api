import { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";
import {
  CREDIT_PACK_CONFIG,
  TIER_CONFIGS,
  getCustomBusinessEntitlementForStripePriceId,
  getTierByStripePriceId,
  normalizeTier,
} from "../../utils/tierConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

function getStripeId(
  value: string | Stripe.Customer | Stripe.Subscription | null,
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getTierFromPriceId(priceId?: string | null) {
  if (!priceId) return null;
  const match = getTierByStripePriceId(priceId);
  return match?.id || null;
}

function getSubscriptionPlanDetails(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return null;

  const lineItems = session.line_items?.data || [];
  const priceId = lineItems[0]?.price?.id || null;
  const tier = normalizeTier(
    session.metadata?.tier || getTierFromPriceId(priceId),
  );
  const config = TIER_CONFIGS[tier];
  const customEntitlement =
    getCustomBusinessEntitlementForStripePriceId(priceId);

  if (!config || tier === "free") return null;

  return {
    tier,
    name: config.displayName,
    monthly_price_eur:
      customEntitlement?.monthlyPriceEur ?? config.monthlyPrice,
    daily_limit: customEntitlement?.dailyLimit ?? config.limits.daily,
    monthly_limit: customEntitlement?.monthlyLimit ?? config.limits.monthly,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session_id } = req.query;

    if (!session_id || typeof session_id !== "string") {
      return res.status(400).json({
        valid: false,
        error: "Missing session_id parameter",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items.data.price"],
    });

    const isValid =
      session &&
      session.payment_status === "paid" &&
      session.status === "complete";

    if (!isValid) {
      return res.status(400).json({
        valid: false,
        error: "Invalid or incomplete session",
        session_status: session?.status,
        payment_status: session?.payment_status,
      });
    }

    let fulfilled = false;
    let fulfillmentType: "subscription" | "credit_pack" | "unknown" =
      session.mode === "subscription" ? "subscription" : "unknown";

    if (
      session.mode === "payment" &&
      session.metadata?.purchase_type === "credit_pack"
    ) {
      fulfillmentType = "credit_pack";

      const { data, error } = await supabase
        .from("credit_ledger")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking credit pack fulfillment:", error);
      }

      fulfilled = !!data;
    } else if (session.mode === "subscription") {
      const subscriptionId = getStripeId(session.subscription);

      if (subscriptionId) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .eq("subscription_status", "active")
          .maybeSingle();

        if (error) {
          console.error("Error checking subscription fulfillment:", error);
        }

        fulfilled = !!data;
      }
    }

    return res.status(200).json({
      valid: true,
      status: fulfilled ? "fulfilled" : "pending",
      fulfilled,
      fulfillment_type: fulfillmentType,
      session: {
        id: session.id,
        customer_email: session.customer_details?.email,
        amount_total: session.amount_total,
        currency: session.currency,
        mode: session.mode,
        payment_status: session.payment_status,
        session_status: session.status,
        purchase_type: session.metadata?.purchase_type || null,
        tier: session.metadata?.tier || null,
        plan: getSubscriptionPlanDetails(session),
        credit_pack:
          fulfillmentType === "credit_pack"
            ? {
                id: session.metadata?.pack_id || CREDIT_PACK_CONFIG.id,
                credits: Number(
                  session.metadata?.credits || CREDIT_PACK_CONFIG.credits,
                ),
              }
            : null,
        subscription_id: getStripeId(session.subscription),
        created: session.created,
      },
    });
  } catch (error: any) {
    console.error("Stripe session verification error:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        valid: false,
        error: "Invalid session ID",
      });
    }

    reportCriticalEndpointFailure({
      endpoint: "/api/stripe/verify-session",
      status: 500,
      details: {
        sessionId:
          typeof req.query.session_id === "string"
            ? req.query.session_id
            : null,
        error: error?.message || String(error),
        errorName: error?.name,
      },
    });
    return res.status(500).json({
      valid: false,
      error: "Failed to verify session",
    });
  }
}
