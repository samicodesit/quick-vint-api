// api/stripe/create-checkout.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { TIER_CONFIGS } from "../../utils/tierConfig";
import { handleCheckoutCors } from "../../utils/checkoutCors";
import {
  createBillingPortalSessionForProfile,
  findManageableBillingByEmail,
  findManageableSubscriptionForCustomer,
  repairProfileStripeCustomerId,
} from "../../utils/stripeBillingPortal";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;
const PAID_TIERS = new Set(["starter", "pro", "business"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await handleCheckoutCors(req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let alertContext: {
    userId?: string;
    tier?: string;
    source?: string;
  } = {};

  try {
    const { email, tier, source, utm } = req.body as {
      email: string;
      tier: "starter" | "pro" | "business"; // No 'free' since it's not a paid tier
      source?: string;
      utm?: Record<string, string>;
    };
    alertContext = { tier, source };

    // 1) Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    // 2) Validate tier and get price ID
    if (!tier || !PAID_TIERS.has(tier) || !TIER_CONFIGS[tier]) {
      return res.status(400).json({ error: "Invalid tier specified." });
    }

    const tierConfig = TIER_CONFIGS[tier];
    const priceId = tierConfig.stripe.priceId;

    // 3) Look up existing stripe_customer_id in Supabase
    let customerId: string | null = null;
    let activeSubscriptionId: string | null = null;
    {
      const { data: profileRow, error: fetchErr } = await supabase
        .from("profiles")
        .select(
          "id, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier",
        )
        .ilike("email", email)
        .single();

      if (fetchErr) {
        console.error("Error fetching profile for checkout:", fetchErr);
        // continue – we can create a new customer
      } else if (profileRow) {
        alertContext.userId = profileRow.id;
        if (profileRow.stripe_customer_id) {
          customerId = profileRow.stripe_customer_id;
          if (
            profileRow.subscription_status === "active" &&
            profileRow.subscription_tier &&
            profileRow.subscription_tier !== "free" &&
            profileRow.stripe_subscription_id
          ) {
            activeSubscriptionId = profileRow.stripe_subscription_id;
          }
        }
      }
    }

    // 4) If we have a customerId, verify it still exists in Stripe
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        // If no error, customer still exists, keep using it.
      } catch (stripeErr: any) {
        console.warn(
          "Stored customer not found, will create new:",
          stripeErr.message,
        );
        customerId = null;
        activeSubscriptionId = null;
      }
    }

    if (customerId && !activeSubscriptionId) {
      const manageableSubscription =
        await findManageableSubscriptionForCustomer(stripe, customerId);
      if (manageableSubscription) {
        activeSubscriptionId = manageableSubscription.id;
      }
    }

    if (!customerId) {
      const existingBilling = await findManageableBillingByEmail(stripe, email);
      if (existingBilling) {
        customerId = existingBilling.customerId;
        activeSubscriptionId = existingBilling.subscriptionId;
        await repairProfileStripeCustomerId(email, customerId);
      }
    }

    // Existing subscribers should update their current subscription in Stripe's
    // customer portal. This prevents duplicate subscriptions if Supabase or the
    // frontend has stale plan state. The helper verifies the subscription's real
    // customer before creating the portal session.
    if (customerId && activeSubscriptionId) {
      const portalSession = await createBillingPortalSessionForProfile({
        stripe,
        email,
        customerId,
        subscriptionId: activeSubscriptionId,
        returnUrl: process.env.STRIPE_PORTAL_RETURN_URL!,
        context: "create_checkout_active_subscriber_guard",
      });

      return res.status(200).json({
        url: portalSession.url,
        mode: "portal",
        reason: "existing_active_subscription",
      });
    }

    // 5) If no valid customerId, create a new Stripe Customer
    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: { source: "auto_lister_extension" },
      });
      customerId = newCustomer.id;

      // Persist stripe_customer_id back to Supabase
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .ilike("email", email);

      if (updateErr) {
        console.error("Error saving new stripe_customer_id:", updateErr);
        // But we can proceed with the new customerId anyway.
      }
    }

    // 6) Create Stripe Checkout Session using priceId and the validated customerId
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: customerId,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CANCEL_URL}?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      metadata: {
        source: source || "unknown",
        tier,
        utm_source: utm?.utm_source || "",
        utm_medium: utm?.utm_medium || "",
        utm_campaign: utm?.utm_campaign || "",
        utm_content: utm?.utm_content || "",
        utm_term: utm?.utm_term || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-checkout error:", err);
    reportCriticalEndpointFailure({
      endpoint: "/api/stripe/create-checkout",
      status: 500,
      userId: alertContext.userId,
      details: {
        tier: alertContext.tier,
        source: alertContext.source,
        error: err?.message || String(err),
        errorName: err?.name,
      },
    });
    return res.status(500).json({ error: err.message });
  }
}
