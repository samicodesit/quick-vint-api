import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { CREDIT_PACK_CONFIG } from "../../utils/tierConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;
const CREDIT_PACK_PRICE_ID = process.env.STRIPE_CREDIT_PACK_PRICE_ID!;

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

    if (!CREDIT_PACK_PRICE_ID) {
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
      payment_method_types: ["card"],
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
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-credit-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
