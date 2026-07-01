// api/stripe/create-portal.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { handleCheckoutCors } from "../../utils/checkoutCors";
import { createBillingPortalSessionForProfile } from "../../utils/stripeBillingPortal";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const RETURN_URL = process.env.STRIPE_PORTAL_RETURN_URL!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await handleCheckoutCors(req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
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

    if (fetchErr || !profileRow?.stripe_customer_id) {
      console.error("No stripe_customer_id found for:", email, fetchErr);
      return res
        .status(400)
        .json({ error: "No Stripe customer on file for this user." });
    }

    // 2) Create a Customer Portal session that lands on subscription management.
    // Verify the subscription's real Stripe customer first, because older
    // duplicate-checkout flows can leave profile customer/subscription IDs
    // temporarily out of sync.
    const portalSession = await createBillingPortalSessionForProfile({
      stripe,
      email,
      customerId: profileRow.stripe_customer_id,
      subscriptionId: profileRow.stripe_subscription_id,
      returnUrl: RETURN_URL,
      context: "create_portal",
    });

    // 3) Return the URL to the popup
    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error("❌ create-portal error:", err);
    return res.status(500).json({ error: err.message });
  }
}
