// api/stripe/webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

type Tier = "unlimited_monthly" | "unlimited_annual";
function mapTier(interval: string): Tier {
  return interval === "year" ? "unlimited_annual" : "unlimited_monthly";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  // 1) Verify signature and parse event
  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
    console.log(`✅ Stripe webhook signature OK. Event: ${event.type}`);
  } catch (err: any) {
    console.error("⚠️ Signature verification failed:", err.message);
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

        // Only proceed if this was a subscription checkout
        if (session.mode === "subscription" && session.subscription) {
          // 2a) Retrieve full Subscription
          const subscription = (await stripe.subscriptions.retrieve(
            session.subscription as string
          )) as any;

          const interval = subscription.items.data[0].plan.interval as string;
          const tier = mapTier(interval);
          const status = subscription.status as string;

          // Extract current_period_end (always present once subscription is active/trialing)
          const rawEnd = (subscription as any).current_period_end as number;
          const currentPeriodEnd = new Date(rawEnd * 1000).toISOString();

          // 2b) Upsert stripe_customer_id on profiles
          await supabase
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .ilike("email", email);

          // 2c) Find that user’s profile row by email
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("id")
            .ilike("email", email)
            .single();

          if (profileRow) {
            await supabase
              .from("profiles")
              .update({
                stripe_subscription_id: subscription.id,
                stripe_customer_id: customerId,
                subscription_tier: tier,
                subscription_status: status,
                current_period_end: currentPeriodEnd,
              })
              .eq("id", profileRow.id);
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        console.log(`⏳ Handling ${event.type}`);
        const subscription = event.data.object as Stripe.Subscription;
        const subObj = subscription as any;

        const customerId = subObj.customer as string;
        const interval = subObj.items.data[0].plan.interval as string;
        const tier = mapTier(interval);
        const status = subObj.status as string;

        // current_period_end is always a Unix timestamp when subscription is active or trialing
        const rawEnd = subObj.current_period_end as number;
        const currentPeriodEnd = new Date(rawEnd * 1000).toISOString();

        // 1) Try to find profile by stripe_customer_id
        let { data: profileRow } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        // 2) Fallback: match by email
        if (!profileRow) {
          const customer = await stripe.customers.retrieve(customerId);
          const custAny = customer as any;
          const email = custAny.email as string | undefined;
          if (email) {
            const { data } = await supabase
              .from("profiles")
              .select("id")
              .ilike("email", email)
              .single();
            profileRow = data as any;
          }
        }

        if (profileRow) {
          await supabase
            .from("profiles")
            .update({
              stripe_subscription_id: subscription.id,
              subscription_tier: tier,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
            })
            .eq("id", profileRow.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        console.log("⏳ Handling customer.subscription.deleted");
        const subscription = event.data.object as Stripe.Subscription;
        const subObj = subscription as any;
        const customerId = subObj.customer as string;

        // Find profile by stripe_customer_id
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profileRow) {
          await supabase
            .from("profiles")
            .update({
              subscription_status: "canceled",
              subscription_tier: "free",
              current_period_end: null,
            })
            .eq("id", profileRow.id);
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Error handling Stripe webhook:", err);
    return res.status(500).end();
  }
}
