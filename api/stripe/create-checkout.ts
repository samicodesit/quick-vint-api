// api/stripe/create-checkout.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { TIER_CONFIGS } from "../../utils/tierConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email, tier } = req.body as {
      email: string;
      tier: "starter" | "pro" | "business"; // No 'free' since it's not a paid tier
    };

    // 1) Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    // 2) Validate tier and get price ID
    if (!tier || !TIER_CONFIGS[tier]) {
      return res.status(400).json({ error: "Invalid tier specified." });
    }

    const tierConfig = TIER_CONFIGS[tier];
    const priceId = tierConfig.stripe.priceId;

    // 3) Look up existing stripe_customer_id in Supabase
    let customerId: string | null = null;
    {
      const { data: profileRow, error: fetchErr } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .ilike("email", email)
        .single();

      if (fetchErr) {
        console.error("Error fetching profile for checkout:", fetchErr);
        // continue – we can create a new customer
      } else if (profileRow?.stripe_customer_id) {
        customerId = profileRow.stripe_customer_id;
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
      }
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
      payment_method_types: ["card"],
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
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
