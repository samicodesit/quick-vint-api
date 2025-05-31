// api/stripe/create‐checkout.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";

// Initialize Stripe (no apiVersion needed)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

// Now using lookup keys instead of raw Price IDs
const LOOKUP_KEY_MONTHLY = process.env.PRICE_LOOKUP_KEY_MONTHLY!;
const LOOKUP_KEY_ANNUAL = process.env.PRICE_LOOKUP_KEY_ANNUAL!;
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email, interval } = req.body as {
      email: string;
      interval?: "monthly" | "annual";
    };

    // Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    // Choose lookup key
    const chosenInterval = interval === "annual" ? "annual" : "monthly";
    const priceLookupKey =
      chosenInterval === "annual" ? LOOKUP_KEY_ANNUAL : LOOKUP_KEY_MONTHLY;

    // 1) Look up existing Stripe Customer ID in Supabase (if any)
    let customerId: string | null = null;
    {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .ilike("email", email)
        .single();

      if (profileRow && profileRow.stripe_customer_id) {
        customerId = profileRow.stripe_customer_id;
      }
    }

    // 2) If none, create a new Stripe Customer
    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: { source: "auto_lister_extension" },
      });
      customerId = newCustomer.id;

      // Persist stripe_customer_id back to Supabase
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .ilike("email", email);
    }

    // 3) Create a Checkout Session using the lookup key
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceLookupKey, // this is the lookup key (not a raw amount)
          quantity: 1,
        },
      ],
      customer: customerId,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      customer_email: email,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create‐checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
