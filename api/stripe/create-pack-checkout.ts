import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { PACK_CONFIG } from "../../utils/tierConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email } = req.body as { email: string };

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    const priceId = PACK_CONFIG.stripe.priceId;
    if (!priceId || priceId.includes("PLACEHOLDER")) {
      console.error("Stripe price ID not configured for pack");
      return res
        .status(500)
        .json({ error: "Pack purchase not available yet." });
    }

    // Look up existing Stripe customer.
    let customerId: string | null = null;
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .ilike("email", email)
      .single();

    if (profileRow?.stripe_customer_id) {
      customerId = profileRow.stripe_customer_id;
      try {
        await stripe.customers.retrieve(customerId!);
      } catch {
        customerId = null;
      }
    }

    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: { source: "autolister_extension" },
      });
      customerId = newCustomer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .ilike("email", email);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}&type=pack`,
      cancel_url: `${CANCEL_URL}?session_id={CHECKOUT_SESSION_ID}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-pack-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
