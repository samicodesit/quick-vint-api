import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { CREDIT_PACK_CONFIG } from "../../utils/tierConfig";
import { handleCheckoutCors } from "../../utils/checkoutCors";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;
const CREDIT_PACK_PRICE_ID = process.env.STRIPE_CREDIT_PACK_PRICE_ID!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await handleCheckoutCors(req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let alertContext: {
    source?: string;
    profileId?: string;
  } = {};

  try {
    const { email, source, utm } = req.body as {
      email: string;
      source?: string;
      utm?: Record<string, string>;
    };
    alertContext = { source };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    if (!CREDIT_PACK_PRICE_ID) {
      reportCriticalEndpointFailure({
        endpoint: "/api/stripe/create-credit-checkout",
        status: 500,
        details: {
          source,
          error: "Credit pack Stripe price is not configured.",
        },
      });
      return res
        .status(500)
        .json({ error: "Credit pack Stripe price is not configured." });
    }

    let customerId: string | null = null;
    const { data: profileRow, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, stripe_customer_id")
      .ilike("email", email)
      .single();

    if (fetchErr || !profileRow) {
      console.error("Profile not found for credit checkout:", email, fetchErr);
      return res.status(404).json({ error: "User profile was not found." });
    }
    alertContext.profileId = profileRow.id;

    if (profileRow.stripe_customer_id) {
      try {
        await stripe.customers.retrieve(profileRow.stripe_customer_id);
        customerId = profileRow.stripe_customer_id;
      } catch (stripeErr: any) {
        console.warn(
          "Stored customer not found, will create new:",
          stripeErr.message,
        );
      }
    }

    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: { source: "auto_lister_extension" },
      });
      customerId = newCustomer.id;

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", profileRow.id);

      if (updateErr) {
        console.error("Error saving new stripe_customer_id:", updateErr);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: CREDIT_PACK_PRICE_ID,
          quantity: 1,
        },
      ],
      customer: customerId,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CANCEL_URL}?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      metadata: {
        purchase_type: "credit_pack",
        pack_id: CREDIT_PACK_CONFIG.id,
        credits: String(CREDIT_PACK_CONFIG.credits),
        profile_id: profileRow.id,
        source: source || "unknown",
        utm_source: utm?.utm_source || "",
        utm_medium: utm?.utm_medium || "",
        utm_campaign: utm?.utm_campaign || "",
        utm_content: utm?.utm_content || "",
        utm_term: utm?.utm_term || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-credit-checkout error:", err);
    reportCriticalEndpointFailure({
      endpoint: "/api/stripe/create-credit-checkout",
      status: 500,
      userId: alertContext.profileId,
      details: {
        source: alertContext.source,
        error: err?.message || String(err),
        errorName: err?.name,
      },
    });
    return res.status(500).json({ error: err.message });
  }
}
