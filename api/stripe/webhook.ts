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

  // 1) Retrieve raw body + signature header
  const buf = await buffer(req);
  const sigHeader = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sigHeader, WEBHOOK_SECRET);
    console.log(`✅ Stripe webhook signature OK. Event: ${event.type}`);
  } catch (err: any) {
    console.error("⚠️ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2) Handle event types
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        console.log("⏳ Handling checkout.session.completed");
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const email = session.customer_details?.email!;

        if (session.mode === "subscription" && session.subscription) {
          // Fetch the full Subscription
          const subscription = (await stripe.subscriptions.retrieve(
            session.subscription as string
          )) as any;

          // Pull interval from the first item’s plan
          const interval = subscription.items.data[0]?.plan.interval as string;
          const tier = mapTier(interval);
          const status = subscription.status as string;

          // Pull current_period_end from items.data[0]
          const rawEnd = subscription.items.data[0]?.current_period_end;
          let currentPeriodEnd: string | null = null;
          if (typeof rawEnd === "number") {
            currentPeriodEnd = new Date(rawEnd * 1000).toISOString();
          }

          // 2a) Upsert stripe_customer_id
          await supabase
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .ilike("email", email);

          // 2b) Find the user’s profile row by email
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
        const subAny = subscription as any;

        const customerId = subAny.customer as string;
        // Same logic: interval from items.data[0].plan.interval
        const interval = subAny.items.data[0]?.plan.interval as string;
        const tier = mapTier(interval);
        const status = subAny.status as string;

        // Pull current_period_end from items.data[0]
        const rawEnd = subAny.items.data[0]?.current_period_end as
          | number
          | undefined;
        let currentPeriodEnd: string | null = null;
        if (typeof rawEnd === "number") {
          currentPeriodEnd = new Date(rawEnd * 1000).toISOString();
        }

        // 1) Try find profile by stripe_customer_id
        let { data: profileRow } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        // 2) Fallback: match by email if no customer_id found
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
              stripe_subscription_id: subAny.id,
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
        const subAny = subscription as any;
        const customerId = subAny.customer as string;

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
