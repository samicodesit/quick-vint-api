// api/stripe/create-portal.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { handleCheckoutCors } from "../../utils/checkoutCors";
import {
  createBillingPortalSessionForProfile,
  findManageableBillingByEmail,
  findManageableSubscriptionForCustomer,
} from "../../utils/stripeBillingPortal";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";
import {
  getMobilePortalReturnUrl,
  MobileBillingRequestError,
  resolveMobileBillingProfile,
} from "../../utils/mobileCheckout";
import { getMobileWebClient, MOBILE_WEB_CLIENT } from "../../utils/mobileWeb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const RETURN_URL = process.env.STRIPE_PORTAL_RETURN_URL!;

function isMobileWebRequest(req: VercelRequest) {
  const value = req.headers?.["x-autolister-client"];
  const client = Array.isArray(value) ? value[0] : value;
  return getMobileWebClient(client) === MOBILE_WEB_CLIENT;
}

function getRequestOrigin(req: VercelRequest) {
  const value = req.headers?.origin;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await handleCheckoutCors(req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let alertContext: {
    customerId?: string | null;
    subscriptionId?: string | null;
  } = {};

  try {
    if (isMobileWebRequest(req)) {
      const profile = await resolveMobileBillingProfile(req);
      let customerId = profile.stripe_customer_id;
      let subscriptionId = profile.stripe_subscription_id;
      alertContext = { customerId, subscriptionId };

      if (!customerId) {
        return res
          .status(400)
          .json({ error: "No Stripe customer on file for this user." });
      }

      if (!subscriptionId) {
        const manageableSubscription =
          await findManageableSubscriptionForCustomer(stripe, customerId);
        subscriptionId = manageableSubscription?.id || null;
      }

      const portalSession = await createBillingPortalSessionForProfile({
        stripe,
        email: profile.email,
        customerId,
        subscriptionId,
        returnUrl: getMobilePortalReturnUrl(getRequestOrigin(req)),
        context: "create_portal_mobile",
      });

      return res.status(200).json({ url: portalSession.url });
    }

    const { email } = req.body as { email: string };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    // 1) Look up the user’s stripe_customer_id in Supabase (profiles table).
    const { data: profileRow, error: fetchErr } = await supabase
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id")
      .ilike("email", email)
      .single();

    let customerId = profileRow?.stripe_customer_id || null;
    let subscriptionId = profileRow?.stripe_subscription_id || null;
    alertContext = { customerId, subscriptionId };

    if (fetchErr || !customerId) {
      const existingBilling = await findManageableBillingByEmail(stripe, email);
      if (existingBilling) {
        customerId = existingBilling.customerId;
        subscriptionId = existingBilling.subscriptionId;
        alertContext = { customerId, subscriptionId };
      } else {
        console.error("No stripe_customer_id found for:", email, fetchErr);
        return res
          .status(400)
          .json({ error: "No Stripe customer on file for this user." });
      }
    }

    // 2) Create a Customer Portal session that lands on subscription management.
    // Verify the subscription's real Stripe customer first, because older
    // duplicate-checkout flows can leave profile customer/subscription IDs
    // temporarily out of sync.
    const portalSession = await createBillingPortalSessionForProfile({
      stripe,
      email,
      customerId,
      subscriptionId,
      returnUrl: RETURN_URL,
      context: "create_portal",
    });

    // 3) Return the URL to the popup
    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    if (err instanceof MobileBillingRequestError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
    }

    console.error("❌ create-portal error:", err);
    reportCriticalEndpointFailure({
      endpoint: "/api/stripe/create-portal",
      status: 500,
      details: {
        customerId: alertContext.customerId,
        subscriptionId: alertContext.subscriptionId,
        error: err?.message || String(err),
        errorName: err?.name,
      },
    });
    return res.status(500).json({ error: err.message });
  }
}
