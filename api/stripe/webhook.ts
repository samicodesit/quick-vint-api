import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import Stripe from "stripe";
import { Resend } from "resend";
import { supabase } from "../../utils/supabaseClient";
import {
  getTierByStripePriceId,
  LEGACY_TIER_IDS,
  NEW_TIER_CONFIGS,
  PACK_CONFIG,
} from "../../utils/tierConfig";
import {
  grantSubscriptionCredits,
  upgradeSubscriptionCredits,
  cancelSubscriptionCredits,
  freezeSubscriptionCreditsOnFailure,
  addPackCredits,
} from "../../utils/credits";
import { BRAND, TEMPLATES, wrapEmailLayout } from "../../utils/emailTemplates";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const resend = new Resend(process.env.RESEND_API_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Calculates prorated credits for a mid-cycle upgrade. */
function calcProratedCredits(
  periodStart: number,
  periodEnd: number,
  monthlyCredits: number,
): number {
  const now = Math.floor(Date.now() / 1000);
  const totalSecs = periodEnd - periodStart;
  const remainingSecs = Math.max(0, periodEnd - now);
  const fraction = totalSecs > 0 ? remainingSecs / totalSecs : 1;
  return Math.max(1, Math.round(monthlyCredits * fraction));
}

async function sendPaymentFailureEmail(
  template: "payment_failed_day1" | "payment_failed_day5",
  userEmail: string,
  unsubscribeToken: string | null,
): Promise<void> {
  const tpl = TEMPLATES[template];
  if (!tpl) return;

  const unsubUrl = unsubscribeToken
    ? `https://autolister.app/api/unsubscribe?token=${unsubscribeToken}`
    : "https://autolister.app/api/unsubscribe";

  const html = wrapEmailLayout(tpl.body, tpl.preheader, unsubUrl);

  try {
    await resend.emails.send({
      from: BRAND.from,
      to: userEmail,
      subject: tpl.subject,
      html,
      headers: {
        "List-Unsubscribe": `<mailto:unsubscribe@autolister.app?subject=Unsubscribe>, <${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (err: any) {
    console.error(`Failed to send ${template} to ${userEmail}:`, err.message);
  }
}

/** Looks up a profile by stripe_customer_id, falling back to email lookup. */
async function findProfileByCustomer(
  customerId: string,
  selectCols: string,
): Promise<Record<string, any> | null> {
  let { data } = await supabase
    .from("profiles")
    .select(selectCols)
    .eq("stripe_customer_id", customerId)
    .single();

  if (!data) {
    let email: string | undefined;
    try {
      const customer = await stripe.customers.retrieve(customerId);
      email = (customer as any).email as string | undefined;
    } catch (err: any) {
      console.error(
        `Unable to retrieve Stripe customer ${customerId}:`,
        err.message,
      );
      return null;
    }

    if (email) {
      const result = await supabase
        .from("profiles")
        .select(selectCols)
        .ilike("email", email)
        .single();
      data = result.data;
    }
  }

  return data ?? null;
}

async function getCustomerEmail(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return (customer as any).email ?? null;
  } catch (err: any) {
    console.error(
      `Unable to retrieve Stripe customer ${customerId}:`,
      err.message,
    );
    return null;
  }
}

async function findProfileByCheckoutSession(
  session: Stripe.Checkout.Session,
  selectCols: string,
): Promise<Record<string, any> | null> {
  const customerId =
    typeof session.customer === "string" ? session.customer : null;

  if (customerId) {
    const { data } = await supabase
      .from("profiles")
      .select(selectCols)
      .eq("stripe_customer_id", customerId)
      .single();

    if (data) return data;
  }

  const email =
    session.customer_details?.email ||
    session.customer_email ||
    (customerId ? await getCustomerEmail(customerId) : null);

  if (!email) {
    console.error(`Checkout session ${session.id} has no resolvable email`);
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select(selectCols)
    .ilike("email", email)
    .single();

  const profile = data as Record<string, any> | null;

  if (profile && customerId && profile.stripe_customer_id !== customerId) {
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", profile.id);
  }

  return profile ?? null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  const buf = await buffer(req);
  const sigHeader = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sigHeader, WEBHOOK_SECRET);
    console.log(`✅ Stripe webhook: ${event.type}`);
  } catch (err: any) {
    console.error("⚠️ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { error: eventClaimError } = await supabase
    .from("processed_stripe_events")
    .insert({ event_id: event.id, event_type: event.type });

  if ((eventClaimError as any)?.code === "23505") {
    console.log(`↩️ Stripe webhook ${event.id} already processed; skipping.`);
    return res.json({ received: true, deduped: true });
  }

  if (eventClaimError) {
    console.error("Failed to claim Stripe webhook event:", eventClaimError);
    return res.status(500).end();
  }

  try {
    switch (event.type) {
      // ── New checkout completed ──────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;

        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );

          const item = subscription.items.data[0];
          const priceId = item?.price.id;
          if (!priceId || !item?.current_period_end) {
            console.error(
              `Subscription ${subscription.id} is missing item price or period end`,
            );
            break;
          }

          const tierConfig = getTierByStripePriceId(priceId);
          const tier = tierConfig?.name || "free";
          const status = subscription.status as string;
          const periodEnd = item.current_period_end;
          const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
          const isLegacyTier = LEGACY_TIER_IDS.has(tier);

          const profileRow = await findProfileByCheckoutSession(
            session,
            "id, email, stripe_customer_id, credits_cycle_end, is_legacy_plan, stripe_subscription_id",
          );

          if (profileRow) {
            // Plan switch via Checkout: cancel the previous subscription so the
            // user isn't billed for two plans simultaneously.
            if (
              profileRow.stripe_subscription_id &&
              profileRow.stripe_subscription_id !== subscription.id
            ) {
              try {
                await stripe.subscriptions.cancel(
                  profileRow.stripe_subscription_id,
                );
                console.log(
                  `Cancelled previous subscription ${profileRow.stripe_subscription_id} for ${profileRow.email}`,
                );
              } catch (err: any) {
                console.error(
                  `Failed to cancel previous subscription for ${profileRow.email}:`,
                  err.message,
                );
              }
            }

            await supabase
              .from("profiles")
              .update({
                stripe_subscription_id: subscription.id,
                ...(customerId ? { stripe_customer_id: customerId } : {}),
                subscription_tier: tier,
                subscription_status: status,
                current_period_end: currentPeriodEnd,
                is_legacy_plan: isLegacyTier,
                pending_tier: null,
              })
              .eq("id", profileRow.id);

            // Grant credits only on first subscribe (idempotency: skip if cycle
            // end is already set to this period, meaning subscription.created
            // already fired first).
            if (
              !isLegacyTier &&
              currentPeriodEnd &&
              profileRow.credits_cycle_end !== currentPeriodEnd
            ) {
              const newTierConfig = NEW_TIER_CONFIGS[tier];
              if (newTierConfig?.credits) {
                await grantSubscriptionCredits(
                  profileRow.id,
                  newTierConfig.credits.monthly,
                  newTierConfig.credits.rolloverCap,
                  currentPeriodEnd,
                );
              }
            }
          }
        }

        // One-time pack purchase
        if (session.mode === "payment") {
          const lineItems = await stripe.checkout.sessions.listLineItems(
            session.id,
          );
          const packItem = lineItems.data.find(
            (item) => item.price?.id === PACK_CONFIG.stripe.priceId,
          );

          if (packItem) {
            const profileRow = await findProfileByCheckoutSession(
              session,
              "id, email, stripe_customer_id",
            );

            if (profileRow) {
              await addPackCredits(profileRow.id, PACK_CONFIG.credits);
            }
          }
        }
        break;
      }

      // ── Subscription created or updated ────────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId = subscription.customer as string;
        const item = subscription.items.data[0];
        const priceId = item?.price.id;
        if (
          !priceId ||
          !item?.current_period_end ||
          !item.current_period_start
        ) {
          console.error(
            `Subscription ${subscription.id} is missing item price or period bounds`,
          );
          break;
        }

        const tierConfig = getTierByStripePriceId(priceId);
        const tier = tierConfig?.name || "free";
        const status = subscription.status;
        const periodEnd = item.current_period_end;
        const periodStart = item.current_period_start;
        const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
        const isLegacyTier = LEGACY_TIER_IDS.has(tier);

        const profileRow = await findProfileByCustomer(
          customerId,
          "id, credits_cycle_end, is_legacy_plan, subscription_tier, pending_tier, payment_grace_started_at",
        );

        if (!profileRow) break;

        // Always persist subscription metadata.
        await supabase
          .from("profiles")
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: status,
            current_period_end: currentPeriodEnd,
            is_legacy_plan: isLegacyTier,
          })
          .eq("id", profileRow.id);

        // Legacy subscribers: never touch their credits.
        if (isLegacyTier || profileRow.is_legacy_plan) break;

        // Don't grant credits during past_due / unpaid — the status update
        // above is sufficient; the grace period is handled by invoice events.
        if (status !== "active") break;

        // ── Determine what changed ──────────────────────────────────────────
        const isRenewal = currentPeriodEnd !== profileRow.credits_cycle_end;

        const storedTier = profileRow.subscription_tier as string | null;
        const storedTierConfig = storedTier
          ? NEW_TIER_CONFIGS[storedTier]
          : null;
        const isTierChange =
          !!tierConfig && !!storedTierConfig && tier !== storedTier;
        const isUpgrade =
          isTierChange &&
          (tierConfig?.monthlyPrice ?? 0) >
            (storedTierConfig?.monthlyPrice ?? 0);
        const isDowngrade =
          isTierChange &&
          (tierConfig?.monthlyPrice ?? 0) <
            (storedTierConfig?.monthlyPrice ?? 0);

        if (isRenewal) {
          // Cycle completed. Apply pending downgrade if queued, else normal renewal.
          const tierToApply =
            (profileRow.pending_tier as string | null) || tier;
          const configToApply = NEW_TIER_CONFIGS[tierToApply];

          if (configToApply?.credits) {
            await grantSubscriptionCredits(
              profileRow.id,
              configToApply.credits.monthly,
              configToApply.credits.rolloverCap,
              currentPeriodEnd,
            );
            await supabase
              .from("profiles")
              .update({
                subscription_tier: tierToApply,
                pending_tier: null,
              })
              .eq("id", profileRow.id);
          }
        } else if (isUpgrade) {
          // Mid-cycle upgrade: preserve all credits, add prorated new ones.
          const proratedCredits = calcProratedCredits(
            periodStart,
            periodEnd,
            tierConfig!.credits!.monthly,
          );
          await upgradeSubscriptionCredits(
            profileRow.id,
            proratedCredits,
            currentPeriodEnd,
          );
          await supabase
            .from("profiles")
            .update({
              subscription_tier: tier,
              pending_tier: null,
            })
            .eq("id", profileRow.id);
        } else if (isDowngrade) {
          // Mid-cycle downgrade: store pending tier, user keeps features until renewal.
          await supabase
            .from("profiles")
            .update({ pending_tier: tier })
            .eq("id", profileRow.id);
        } else if (
          !isRenewal &&
          !isTierChange &&
          !profileRow.credits_cycle_end
        ) {
          // First subscription (subscription.created before checkout.session.completed).
          if (tierConfig?.credits) {
            await grantSubscriptionCredits(
              profileRow.id,
              tierConfig.credits.monthly,
              tierConfig.credits.rolloverCap,
              currentPeriodEnd,
            );
            await supabase
              .from("profiles")
              .update({ subscription_tier: tier })
              .eq("id", profileRow.id);
          }
        }
        break;
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const profileRow = await findProfileByCustomer(
          customerId,
          "id, is_legacy_plan, payment_grace_started_at",
        );

        if (!profileRow) break;

        await supabase
          .from("profiles")
          .update({
            subscription_status: "canceled",
            subscription_tier: "free",
            current_period_end: null,
            pending_tier: null,
            is_legacy_plan: false,
          })
          .eq("id", profileRow.id);

        if (!profileRow.is_legacy_plan) {
          if (profileRow.payment_grace_started_at) {
            // Cancellation from payment failure: freeze rollover until
            // graceStart + 21 days (7-day grace + 14-day freeze). Anchor on
            // grace start so the webhook and payment-recovery cron agree on
            // the deadline regardless of which fires first.
            const graceStartMs = new Date(
              profileRow.payment_grace_started_at,
            ).getTime();
            const frozenUntil = new Date(
              graceStartMs + 21 * 24 * 60 * 60 * 1000,
            ).toISOString();
            await freezeSubscriptionCreditsOnFailure(
              profileRow.id,
              frozenUntil,
            );
          } else {
            // Voluntary cancellation: subscription credits expire immediately.
            await cancelSubscriptionCredits(profileRow.id);
          }
        }
        break;
      }

      // ── Payment failed — start grace period ────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const profileRow = await findProfileByCustomer(
          customerId,
          "id, email, is_legacy_plan, payment_grace_started_at, unsubscribe_token",
        );

        if (!profileRow || profileRow.is_legacy_plan) break;

        // Only record the first failure; retries also fire this event.
        if (!profileRow.payment_grace_started_at) {
          await supabase
            .from("profiles")
            .update({ payment_grace_started_at: new Date().toISOString() })
            .eq("id", profileRow.id);

          if (profileRow.email) {
            await sendPaymentFailureEmail(
              "payment_failed_day1",
              profileRow.email,
              profileRow.unsubscribe_token ?? null,
            );
          }
        }
        break;
      }

      // ── Payment recovered — clear grace period ─────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Only clear grace state; credit granting is handled by subscription.updated.
        await supabase
          .from("profiles")
          .update({
            payment_grace_started_at: null,
            payment_day5_email_sent: false,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    const { error: releaseError } = await supabase
      .from("processed_stripe_events")
      .delete()
      .eq("event_id", event.id);
    if (releaseError) {
      console.error(
        "Failed to release failed webhook event claim:",
        releaseError,
      );
    }
    return res.status(500).end();
  }
}
