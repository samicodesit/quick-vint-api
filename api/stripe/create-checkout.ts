// api/stripe/create-checkout.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

// These should be your actual Price IDs from Stripe Dashboard:
const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY!;
const PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL!;
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

    // 1) Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    // 2) Decide which Price ID to use
    const chosenInterval = interval === "annual" ? "annual" : "monthly";
    const priceId =
      chosenInterval === "annual" ? PRICE_ID_ANNUAL : PRICE_ID_MONTHLY;

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
      cancel_url: CANCEL_URL,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
