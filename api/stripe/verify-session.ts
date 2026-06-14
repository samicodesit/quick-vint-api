import { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

function getStripeId(
  value: string | Stripe.Customer | Stripe.Subscription | null,
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
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

    const session = await stripe.checkout.sessions.retrieve(session_id);

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

    return res.status(500).json({
      valid: false,
      error: "Failed to verify session",
    });
  }
}
