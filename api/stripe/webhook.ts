// api/stripe/webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Omitting apiVersion is fine
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

type Tier = "unlimited_monthly" | "unlimited_annual";
function mapTier(interval: string): Tier {
  return interval === "year" ? "unlimited_annual" : "unlimited_monthly";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    console.log("⚠️ Received non‐POST to /api/stripe/webhook:", req.method);
    return res
      .status(405)
      .json({ received: false, message: "Method Not Allowed" });
  }

  // 1) Retrieve and verify the raw body + signature
  let event: Stripe.Event;
  try {
    const buf = await buffer(req);
    const signature = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(buf, signature, WEBHOOK_SECRET);
    console.log("✅ Stripe webhook signature OK. Event type:", event.type);
  } catch (err: any) {
    console.error("⚠️ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2) Handle relevant event types
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        console.log("⏳ Handling checkout.session.completed");
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const email = session.customer_details?.email!;
        console.log(`· CustomerID: ${customerId}, Email: ${email}`);

        if (session.mode === "subscription" && session.subscription) {
          // Retrieve the full Subscription object
          const subscription = (await stripe.subscriptions.retrieve(
            session.subscription as string
          )) as any;

          const interval = subscription.items.data[0].plan.interval as string;
          const tier = mapTier(interval);
          const status = subscription.status as string;
          const rawEnd = (subscription as any).current_period_end as number;
          const currentPeriodEnd = new Date(rawEnd * 1000).toISOString();

          console.log(
            "· Mapped tier/status:",
            tier,
            status,
            "Period end:",
            currentPeriodEnd
          );

          // 2a) Upsert stripe_customer_id
          const upsertCust = await supabase
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("email", email);
          console.log(
            "· Upsert stripe_customer_id result:",
            upsertCust.error || "OK"
          );

          // 2b) Find that user’s profile row
          const { data: profileRow, error: fetchErr } = await supabase
            .from("profiles")
            .select("id")
            .ilike("email", email)
            .single();
          if (fetchErr || !profileRow) {
            console.warn(
              "· Could not find profile by email:",
              fetchErr || "no row"
            );
            break;
          }

          // 2c) Update profile with subscription info
          const updateRes = await supabase
            .from("profiles")
            .update({
              stripe_subscription_id: subscription.id,
              stripe_customer_id: customerId,
              subscription_tier: tier,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
            })
            .eq("id", profileRow.id);
          console.log("· Updated profile result:", updateRes.error || "OK");
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        console.log("⏳ Handling", event.type);
        const subscription = event.data.object as Stripe.Subscription;
        const subAny = subscription as any;

        const customerId = subAny.customer as string;
        const interval = subAny.items.data[0].plan.interval as string;
        const tier = mapTier(interval);
        const status = subAny.status as string;
        const rawEnd = subAny.current_period_end as number;
        const currentPeriodEnd = new Date(rawEnd * 1000).toISOString();

        console.log(
          "· subID:",
          subscription.id,
          "custID:",
          customerId,
          "tier:",
          tier,
          "status:",
          status
        );

        // 1) Try to find profile by stripe_customer_id
        let { data: profileRow, error: findErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (findErr || !profileRow) {
          console.log(
            "· No profile via stripe_customer_id; trying email fallback"
          );
          const customer = await stripe.customers.retrieve(customerId);
          const custAny = customer as any;
          const email = custAny.email as string | undefined;
          if (email) {
            const { data, error: emailErr } = await supabase
              .from("profiles")
              .select("id")
              .ilike("email", email)
              .single();
            profileRow = data as any;
            if (emailErr || !profileRow) {
              console.warn(
                "· Fallback: no profile by email:",
                emailErr || "none"
              );
            }
          }
        }

        if (profileRow) {
          const updateRes = await supabase
            .from("profiles")
            .update({
              stripe_subscription_id: subscription.id,
              subscription_tier: tier,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
            })
            .eq("id", profileRow.id);
          console.log("· Subscription update result:", updateRes.error || "OK");
        }
        break;
      }

      case "customer.subscription.deleted": {
        console.log("⏳ Handling customer.subscription.deleted");
        const subscription = event.data.object as Stripe.Subscription;
        const subAny = subscription as any;
        const customerId = subAny.customer as string;
        console.log("· subID:", subscription.id, "custID:", customerId);

        // Find profile by stripe_customer_id
        const { data: profileRow, error: findErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (findErr || !profileRow) {
          console.warn(
            "· No profile to delete for custID:",
            customerId,
            findErr || ""
          );
          break;
        }

        const cancelRes = await supabase
          .from("profiles")
          .update({
            subscription_status: "canceled",
            subscription_tier: "free",
            current_period_end: null,
          })
          .eq("id", profileRow.id);
        console.log("· Canceled subscription result:", cancelRes.error || "OK");
        break;
      }

      default:
        console.log("ℹ️ Unhandled event type:", event.type);
        break;
    }

    // Include a small JSON so “Send test webhook” shows you something
    res.json({ received: true, event: event.type });
  } catch (err) {
    console.error("❌ Error handling Stripe webhook:", err);
    res.status(500).json({ received: false, error: (err as any).message });
  }
}
