// api/stripe/webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { ApiLogger } from "../../utils/apiLogger";
import {
  CREDIT_PACK_CONFIG,
  getCustomBusinessEntitlementForStripePriceId,
  getTierByStripePriceId,
} from "../../utils/tierConfig";
import { buildSubscriptionProfileUpdate } from "../../src/utils/subscriptionUsageReset";
import { buildClearAccountPauseUpdate } from "../../src/utils/accountPause";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

function buildCustomBusinessLimitUpdate(
  priceId: string | undefined,
  currentPeriodEnd: string | null,
) {
  const customEntitlement =
    getCustomBusinessEntitlementForStripePriceId(priceId);

  if (!customEntitlement) return {};

  return {
    custom_daily_limit: customEntitlement.dailyLimit,
    custom_monthly_limit: customEntitlement.monthlyLimit,
    custom_limit_expires_at: currentPeriodEnd,
    custom_limit_reason: customEntitlement.reason,
  };
}

function getSubscriptionCurrentPeriodEnd(subscription: any): string | null {
  const rawEnd =
    subscription?.items?.data?.[0]?.current_period_end ??
    subscription?.current_period_end;

  return typeof rawEnd === "number"
    ? new Date(rawEnd * 1000).toISOString()
    : null;
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

        if (
          session.mode === "payment" &&
          session.payment_status === "paid" &&
          session.metadata?.purchase_type === "credit_pack"
        ) {
          const profileId = session.metadata.profile_id;
          const credits = Number(
            session.metadata.credits || CREDIT_PACK_CONFIG.credits,
          );

          if (!profileId || !Number.isFinite(credits) || credits <= 0) {
            console.error("Invalid credit pack checkout metadata:", {
              sessionId: session.id,
              metadata: session.metadata,
            });
            break;
          }

          const { error: grantError } = await supabase.rpc(
            "grant_credit_pack",
            {
              p_user_id: profileId,
              p_stripe_session_id: session.id,
              p_credits: credits,
              p_metadata: {
                customer_id: customerId,
                email,
                pack_id: session.metadata.pack_id || CREDIT_PACK_CONFIG.id,
              },
            },
          );

          if (grantError) {
            throw grantError;
          }

          const { error: unpauseError } = await supabase
            .from("profiles")
            .update(buildClearAccountPauseUpdate())
            .eq("id", profileId);

          if (unpauseError) {
            throw unpauseError;
          }

          await ApiLogger.logRequest({
            userId: profileId,
            userEmail: email,
            endpoint: "/event/credit_pack_paid",
            requestMethod: "POST",
            userAgent: "stripe-webhook",
            responseStatus: 204,
            fullRequestBody: {
              event: "credit_pack_paid",
              source: "stripe_webhook",
              page: "stripe",
              context: {
                checkoutSessionId: session.id,
                stripeCustomerId: customerId,
                packId: session.metadata.pack_id || CREDIT_PACK_CONFIG.id,
                credits,
              },
            },
          });

          break;
        }

        if (session.mode === "subscription" && session.subscription) {
          // Fetch the full Subscription
          const subscription = (await stripe.subscriptions.retrieve(
            session.subscription as string,
          )) as any;

          // Pull interval from the first item’s plan
          const priceId = subscription.items.data[0]?.price.id;
          const tierConfig = getTierByStripePriceId(priceId);
          const tier = tierConfig?.name || "free";
          const status = subscription.status as string;

          const currentPeriodEnd =
            getSubscriptionCurrentPeriodEnd(subscription);

          // 2a) Upsert stripe_customer_id
          await supabase
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .ilike("email", email);

          // 2b) Find the user’s profile row by email
          const { data: profileRow } = await supabase
            .from("profiles")
            .select(
              "id, stripe_subscription_id, subscription_status, subscription_tier",
            )
            .ilike("email", email)
            .single();

          if (profileRow) {
            const updateData = buildSubscriptionProfileUpdate(profileRow, {
              subscriptionId: subscription.id,
              stripeCustomerId: customerId,
              status,
              tier,
              currentPeriodEnd,
              isLegacyPlan: false,
            });
            Object.assign(
              updateData,
              buildCustomBusinessLimitUpdate(priceId, currentPeriodEnd),
            );

            await supabase
              .from("profiles")
              .update(updateData)
              .eq("id", profileRow.id);

            await ApiLogger.logRequest({
              userId: profileRow.id,
              userEmail: email,
              endpoint: "/event/subscription_started",
              requestMethod: "POST",
              userAgent: "stripe-webhook",
              responseStatus: 204,
              subscriptionTier: tier,
              subscriptionStatus: status,
              fullRequestBody: {
                event: "subscription_started",
                source: "stripe_webhook",
                page: "stripe",
                plan: tier,
                context: {
                  checkoutSessionId: session.id,
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscription.id,
                  status,
                  tier,
                },
              },
            });
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
        // Same logic: price ID from items.data[0].price.id
        const priceId = subscription.items.data[0]?.price.id;
        const tierConfig = getTierByStripePriceId(priceId);
        const tier = tierConfig?.name || "free";
        const status = subscription.status as string;

        const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subAny);

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
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select(
              "stripe_subscription_id, subscription_status, subscription_tier, is_legacy_plan",
            )
            .eq("id", profileRow.id)
            .single();
          const existingTier = existingProfile?.subscription_tier;
          const existingSubscriptionId =
            existingProfile?.stripe_subscription_id;
          const keepLegacy =
            Boolean(existingProfile?.is_legacy_plan) &&
            existingSubscriptionId === subAny.id &&
            existingTier === tier;
          const updateData = buildSubscriptionProfileUpdate(existingProfile, {
            subscriptionId: subAny.id,
            status,
            tier,
            currentPeriodEnd,
            isLegacyPlan: keepLegacy,
          });
          Object.assign(
            updateData,
            buildCustomBusinessLimitUpdate(priceId, currentPeriodEnd),
          );

          await supabase
            .from("profiles")
            .update(updateData)
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
              is_legacy_plan: false,
              custom_daily_limit: null,
              custom_monthly_limit: null,
              custom_limit_expires_at: null,
              custom_limit_reason: null,
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
  } catch (err: any) {
    console.error("❌ Error handling Stripe webhook:", err);
    reportCriticalEndpointFailure({
      endpoint: "/api/stripe/webhook",
      status: 500,
      details: {
        eventId: event.id,
        eventType: event.type,
        error: err?.message || String(err),
        errorName: err?.name,
      },
    });
    return res.status(500).end();
  }
}
