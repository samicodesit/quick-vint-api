// api/stripe/webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { ApiLogger } from "../../utils/apiLogger";
import {
  CREDIT_PACK_CONFIG,
  getCreditPackConfig,
  getCustomBusinessEntitlementForStripePriceId,
  getTierByStripePriceId,
} from "../../utils/tierConfig";
import { buildSubscriptionProfileUpdate } from "../../src/utils/subscriptionUsageReset";
import {
  getUnpaidPlanChangeUpdate,
  type PaidProfileSnapshot,
} from "../../src/utils/subscriptionPaymentGuard";
import { mapStripeSubscriptionStatusForProfile } from "../../src/utils/subscriptionStatus";
import { buildClearAccountPauseUpdate } from "../../src/utils/accountPause";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";
import { logStripeBillingEvent } from "../../utils/billingEvents";
import { sendSubscriptionWelcomeEmailOnce } from "../../utils/subscriptionWelcomeEmail";
import {
  hasCustomerFacingWelcomeBilling,
  isSendableWelcomeSubscription,
  resolveWelcomeBillingDetails,
} from "../../utils/subscriptionWelcomeBilling";
import {
  getInvoiceSubscriptionId,
  getPaidSubscriptionPeriod,
} from "../../src/utils/subscriptionInvoice";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const AUDITED_STRIPE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.created",
  "invoice.finalized",
  "invoice.payment_failed",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.voided",
  "invoice.marked_uncollectible",
]);

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

export { getWelcomeBillingDetails } from "../../utils/subscriptionWelcomeBilling";

function getStripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

async function canAdoptSubscription(
  storedSubscriptionId: string | null | undefined,
  incomingSubscription: Stripe.Subscription,
  profileCustomerId?: string | null,
) {
  const incomingSubscriptionId = incomingSubscription.id;
  if (
    !storedSubscriptionId ||
    storedSubscriptionId === incomingSubscriptionId
  ) {
    return true;
  }

  const paidStatuses = ["active", "trialing", "past_due"];
  let storedSubscription: Stripe.Subscription;
  try {
    storedSubscription = (await stripe.subscriptions.retrieve(
      storedSubscriptionId,
    )) as Stripe.Subscription;
  } catch (error) {
    if ((error as { code?: string })?.code !== "resource_missing") throw error;
    const incomingCustomerId = getStripeObjectId(incomingSubscription.customer);
    return Boolean(
      paidStatuses.includes(incomingSubscription.status) &&
      profileCustomerId &&
      incomingCustomerId === profileCustomerId,
    );
  }
  const storedCustomerId = getStripeObjectId(storedSubscription.customer);
  const incomingCustomerId = getStripeObjectId(incomingSubscription.customer);

  return Boolean(
    paidStatuses.includes(incomingSubscription.status) &&
    !paidStatuses.includes(
      (storedSubscription as Stripe.Subscription).status,
    ) &&
    storedCustomerId &&
    incomingCustomerId &&
    storedCustomerId === incomingCustomerId,
  );
}

async function handlePaidSubscriptionInvoice(invoice: any) {
  if (invoice.status !== "paid") return;

  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const period = getPaidSubscriptionPeriod(invoice);
  if (!period) {
    if (
      invoice.billing_reason === "subscription_create" ||
      invoice.billing_reason === "subscription_cycle"
    ) {
      throw new Error(`Paid subscription invoice ${invoice.id} has no period`);
    }
    if (invoice.billing_reason !== "subscription_update") return;
  }

  const subscription = (await stripe.subscriptions.retrieve(
    subscriptionId,
  )) as any;
  const customerId =
    getStripeObjectId(invoice.customer) ||
    getStripeObjectId(subscription.customer);
  if (!customerId) {
    throw new Error(`Paid subscription invoice ${invoice.id} has no customer`);
  }

  const priceId = subscription.items.data[0]?.price.id;
  const tier = getTierByStripePriceId(priceId)?.name || "free";
  if (tier === "free") return;

  const status = mapStripeSubscriptionStatusForProfile(subscription, tier);
  const stripeCurrentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription);
  if (period && stripeCurrentPeriodEnd && period.end !== stripeCurrentPeriodEnd)
    return;
  if (
    !period &&
    (getStripeObjectId(subscription.latest_invoice) !== invoice.id ||
      !stripeCurrentPeriodEnd ||
      !invoice.lines?.data?.some(
        (line: any) =>
          typeof line.period?.end === "number" &&
          new Date(line.period.end * 1000).toISOString() ===
            stripeCurrentPeriodEnd,
      ))
  )
    return;
  const currentPeriodEnd = stripeCurrentPeriodEnd || period?.end || null;

  let { data: profileRow, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (profileLookupError) throw profileLookupError;

  if (!profileRow) {
    let email = invoice.customer_email as string | undefined;
    if (!email) {
      const customer = (await stripe.customers.retrieve(customerId)) as any;
      email = customer.email as string | undefined;
    }
    if (email) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email")
        .ilike("email", email)
        .maybeSingle();
      if (error) throw error;
      profileRow = data as any;
    }
  }

  if (!profileRow) {
    throw new Error(`No profile for paid subscription invoice ${invoice.id}`);
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select(
      "stripe_subscription_id, stripe_customer_id, subscription_status, subscription_tier, is_legacy_plan, current_period_end, last_usage_period_end, paid_access_expires_at",
    )
    .eq("id", profileRow.id)
    .single();
  if (existingProfileError) throw existingProfileError;
  const existingSubscriptionId = existingProfile?.stripe_subscription_id;
  if (
    !(await canAdoptSubscription(
      existingSubscriptionId,
      subscription,
      existingProfile?.stripe_customer_id,
    ))
  ) {
    return;
  }
  const keepLegacy =
    Boolean(existingProfile?.is_legacy_plan) &&
    existingSubscriptionId === subscriptionId &&
    existingProfile?.subscription_tier === tier;
  let updateData = buildSubscriptionProfileUpdate({
    subscriptionId,
    stripeCustomerId: customerId,
    status,
    tier,
    currentPeriodEnd,
    isLegacyPlan: keepLegacy,
  });
  Object.assign(
    updateData,
    buildCustomBusinessLimitUpdate(priceId, currentPeriodEnd),
  );
  const paymentGuard = await protectUnpaidPlanChange(
    subscription,
    existingProfile || {},
    period ? invoice : undefined,
  );
  if (paymentGuard) updateData = paymentGuard;
  else updateData.paid_access_expires_at = null;

  let updateQuery = supabase
    .from("profiles")
    .update(updateData)
    .eq("id", profileRow.id);
  updateQuery = existingSubscriptionId
    ? updateQuery.eq("stripe_subscription_id", existingSubscriptionId)
    : updateQuery.is("stripe_subscription_id", null);
  updateQuery = matchPaidProfileSnapshot(updateQuery, existingProfile || {});
  await commitSubscriptionUpdate(updateQuery);

  // A settled mid-cycle upgrade changes entitlement, never the usage counter.
  if (!period) return;

  const { error: resetError } = await supabase.rpc(
    "reset_monthly_usage_for_paid_invoice",
    {
      p_user_id: profileRow.id,
      p_stripe_subscription_id: subscriptionId,
      p_stripe_invoice_id: invoice.id,
      p_period_end: period.end,
    },
  );
  if (resetError) throw resetError;
}

async function protectUnpaidPlanChange(
  subscription: any,
  profile: PaidProfileSnapshot,
  settledBaseInvoice?: any,
) {
  if (
    profile.stripe_subscription_id !== subscription.id ||
    !profile.subscription_tier ||
    profile.subscription_tier === "free" ||
    !subscription.latest_invoice
  )
    return null;
  // The first Stripe read preceded the profile lookup. Validate it afterwards
  // so a newer payment handler cannot be undone using that earlier snapshot.
  const current = await stripe.subscriptions.retrieve(subscription.id);
  const snapshot = (value: any) =>
    JSON.stringify([
      value.status,
      Boolean(value.cancel_at_period_end),
      getStripeObjectId(value.latest_invoice),
      getSubscriptionCurrentPeriodEnd(value),
      value.items?.data?.map((item: any) => [
        item.id,
        item.price?.id,
        item.quantity,
      ]),
    ]);
  if (snapshot(current) !== snapshot(subscription))
    throw concurrentSubscriptionUpdate();
  const invoice =
    typeof subscription.latest_invoice === "string"
      ? await stripe.invoices.retrieve(subscription.latest_invoice)
      : subscription.latest_invoice;
  if (!invoice) throw new Error("Could not verify subscription invoice");
  if (
    settledBaseInvoice &&
    invoice.billing_reason === "subscription_update" &&
    invoice.status !== "paid"
  ) {
    const period = getPaidSubscriptionPeriod(settledBaseInvoice);
    const baseLine = settledBaseInvoice.lines?.data?.find((line: any) =>
      line.parent?.subscription_item_details
        ? line.parent.subscription_item_details.proration === false
        : line.type === "subscription" && line.proration !== true,
    );
    const basePrice =
      getStripeObjectId(baseLine?.price) ||
      getStripeObjectId(baseLine?.pricing?.price_details?.price);
    const baseTier = basePrice
      ? getTierByStripePriceId(basePrice)?.name
      : undefined;
    if (!period || !baseTier || baseTier === "free")
      throw new Error("Could not verify the settled base plan");
    const paidProfile = {
      ...profile,
      subscription_tier: baseTier,
      subscription_status: "active",
      current_period_end: period.end,
      last_usage_period_end: period.end,
      is_legacy_plan: Boolean(
        profile.is_legacy_plan && profile.subscription_tier === baseTier,
      ),
    };
    const guard = getUnpaidPlanChangeUpdate(paidProfile, subscription, invoice);
    return guard
      ? {
          ...buildSubscriptionProfileUpdate({
            subscriptionId: subscription.id,
            tier: baseTier,
            status: "active",
            currentPeriodEnd: period.end,
            isLegacyPlan: paidProfile.is_legacy_plan,
          }),
          ...buildCustomBusinessLimitUpdate(basePrice || undefined, period.end),
          ...guard,
        }
      : null;
  }
  return getUnpaidPlanChangeUpdate(profile, subscription, invoice);
}

function matchPaidProfileSnapshot(query: any, profile: PaidProfileSnapshot) {
  for (const field of [
    "subscription_tier",
    "subscription_status",
    "current_period_end",
    "last_usage_period_end",
    "is_legacy_plan",
    "paid_access_expires_at",
  ] as const) {
    query =
      profile[field] == null
        ? query.is(field, null)
        : query.eq(field, profile[field]);
  }
  return query;
}

async function commitSubscriptionUpdate(query: any) {
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw concurrentSubscriptionUpdate();
}

function concurrentSubscriptionUpdate() {
  const error = new Error("Subscription changed concurrently; retry webhook");
  error.name = "SubscriptionConcurrentUpdateError";
  return error;
}

async function sendWelcomeForPaidSubscription(input: {
  profileId: string;
  email: string;
  tier: string;
  status: string;
  stripeSubscriptionId: string;
  stripeCheckoutSessionId?: string | null;
  subscription: Stripe.Subscription;
  checkoutSession?: Stripe.Checkout.Session | null;
  isLegacyPlan?: boolean | null;
  customLimits?: { daily: number; monthly: number } | null;
  isCustomPlan?: boolean;
}) {
  if (
    input.tier === "free" ||
    input.status !== "active" ||
    !isSendableWelcomeSubscription(input.subscription)
  ) {
    return;
  }

  try {
    const billing = await resolveWelcomeBillingDetails({
      stripe,
      subscription: input.subscription,
      status: "active",
      checkoutSession: input.checkoutSession,
    });
    if (!hasCustomerFacingWelcomeBilling(billing)) {
      return;
    }

    await sendSubscriptionWelcomeEmailOnce({
      profileId: input.profileId,
      email: input.email,
      tier: input.tier,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      isLegacyPlan: input.isLegacyPlan,
      billing,
      limits: input.customLimits,
      isCustomPlan: input.isCustomPlan,
    });
  } catch (welcomeError) {
    console.error(
      "Subscription welcome email scheduling failed:",
      welcomeError,
    );
  }
}

async function logWebhookBillingEvent(event: Stripe.Event) {
  if (!AUDITED_STRIPE_EVENT_TYPES.has(event.type)) return;

  const object = event.data.object as any;
  await logStripeBillingEvent({
    event,
    email:
      object?.customer_details?.email ||
      object?.customer_email ||
      object?.email ||
      null,
  });
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
    try {
      await logWebhookBillingEvent(event);
    } catch (auditError) {
      console.error("Failed to audit Stripe billing event:", auditError);
    }

    switch (event.type) {
      case "checkout.session.async_payment_succeeded":
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
          const pack = getCreditPackConfig(
            session.metadata.pack_id || CREDIT_PACK_CONFIG.id,
          );
          const credits = Number(session.metadata.credits || pack?.credits);

          if (!profileId || !pack || credits !== pack.credits) {
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
          const status = mapStripeSubscriptionStatusForProfile(
            subscription,
            tier,
          );

          const currentPeriodEnd =
            getSubscriptionCurrentPeriodEnd(subscription);

          // Find the user’s profile row by email
          const { data: profileRow, error: profileError } = await supabase
            .from("profiles")
            .select(
              "id, stripe_subscription_id, stripe_customer_id, subscription_status, subscription_tier, is_legacy_plan, current_period_end, last_usage_period_end, paid_access_expires_at",
            )
            .ilike("email", email)
            .maybeSingle();
          if (profileError) throw profileError;

          if (profileRow) {
            const existingSubscriptionId = profileRow.stripe_subscription_id;
            if (
              !(await canAdoptSubscription(
                existingSubscriptionId,
                subscription,
                profileRow.stripe_customer_id,
              ))
            ) {
              break;
            }
            const keepLegacy =
              Boolean(profileRow.is_legacy_plan) &&
              existingSubscriptionId === subscription.id &&
              profileRow.subscription_tier === tier;
            let updateData = buildSubscriptionProfileUpdate({
              subscriptionId: subscription.id,
              stripeCustomerId: customerId,
              status,
              tier,
              currentPeriodEnd,
              isLegacyPlan: keepLegacy,
            });
            Object.assign(
              updateData,
              buildCustomBusinessLimitUpdate(priceId, currentPeriodEnd),
            );
            const paymentGuard = await protectUnpaidPlanChange(
              subscription,
              profileRow,
            );
            if (paymentGuard) updateData = paymentGuard;
            else if (tier === "free") updateData.paid_access_expires_at = null;

            let updateQuery = supabase
              .from("profiles")
              .update(updateData)
              .eq("id", profileRow.id);
            updateQuery = existingSubscriptionId
              ? updateQuery.eq("stripe_subscription_id", existingSubscriptionId)
              : updateQuery.is("stripe_subscription_id", null);
            updateQuery = matchPaidProfileSnapshot(updateQuery, profileRow);
            await commitSubscriptionUpdate(updateQuery);

            if (
              session.payment_status === "paid" ||
              session.payment_status === "no_payment_required"
            ) {
              await sendWelcomeForPaidSubscription({
                profileId: profileRow.id,
                email,
                tier,
                status,
                stripeSubscriptionId: subscription.id,
                stripeCheckoutSessionId: session.id,
                subscription,
                checkoutSession: session,
                isLegacyPlan: keepLegacy,
                customLimits: getCustomBusinessEntitlementForStripePriceId(
                  priceId,
                )
                  ? (() => {
                      const entitlement =
                        getCustomBusinessEntitlementForStripePriceId(priceId)!;
                      return {
                        daily: entitlement.dailyLimit,
                        monthly: entitlement.monthlyLimit,
                      };
                    })()
                  : null,
                isCustomPlan: Boolean(
                  getCustomBusinessEntitlementForStripePriceId(priceId),
                ),
              });
            }

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
        const eventSubscription = event.data.object as Stripe.Subscription;
        const subscription = (await stripe.subscriptions.retrieve(
          eventSubscription.id,
        )) as Stripe.Subscription;
        const subAny = subscription as any;

        const customerId = subAny.customer as string;
        // Same logic: price ID from items.data[0].price.id
        const priceId = subscription.items.data[0]?.price.id;
        const tierConfig = getTierByStripePriceId(priceId);
        const tier = tierConfig?.name || "free";
        const status = mapStripeSubscriptionStatusForProfile(subAny, tier);

        const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subAny);

        // 1) Try find profile by stripe_customer_id
        let { data: profileRow, error: profileLookupError } = await supabase
          .from("profiles")
          .select("id,email")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;

        // 2) Fallback: match by email if no customer_id found
        if (!profileRow) {
          const customer = await stripe.customers.retrieve(customerId);
          const custAny = customer as any;
          const email = custAny.email as string | undefined;
          if (email) {
            const { data, error } = await supabase
              .from("profiles")
              .select("id,email")
              .ilike("email", email)
              .maybeSingle();
            if (error) throw error;
            profileRow = data as any;
          }
        }

        if (profileRow) {
          const { data: existingProfile, error: existingProfileError } =
            await supabase
              .from("profiles")
              .select(
                "stripe_subscription_id, stripe_customer_id, subscription_status, subscription_tier, is_legacy_plan, current_period_end, last_usage_period_end, paid_access_expires_at",
              )
              .eq("id", profileRow.id)
              .single();
          if (existingProfileError) throw existingProfileError;
          const existingTier = existingProfile?.subscription_tier;
          const existingSubscriptionId =
            existingProfile?.stripe_subscription_id;
          if (
            existingSubscriptionId === subAny.id &&
            existingProfile?.subscription_status === "canceled"
          ) {
            break;
          }
          if (
            !(await canAdoptSubscription(
              existingSubscriptionId,
              subscription,
              existingProfile?.stripe_customer_id,
            ))
          ) {
            break;
          }
          const keepLegacy =
            Boolean(existingProfile?.is_legacy_plan) &&
            existingSubscriptionId === subAny.id &&
            existingTier === tier;
          let updateData = buildSubscriptionProfileUpdate({
            subscriptionId: subAny.id,
            stripeCustomerId: customerId,
            status,
            tier,
            currentPeriodEnd,
            isLegacyPlan: keepLegacy,
          });
          Object.assign(
            updateData,
            buildCustomBusinessLimitUpdate(priceId, currentPeriodEnd),
          );
          const paymentGuard = await protectUnpaidPlanChange(
            subscription,
            existingProfile || {},
          );
          if (paymentGuard) updateData = paymentGuard;
          else if (tier === "free") updateData.paid_access_expires_at = null;

          let updateQuery = supabase
            .from("profiles")
            .update(updateData)
            .eq("id", profileRow.id);
          updateQuery = existingSubscriptionId
            ? updateQuery.eq("stripe_subscription_id", existingSubscriptionId)
            : updateQuery.is("stripe_subscription_id", null);
          updateQuery = matchPaidProfileSnapshot(
            updateQuery,
            existingProfile || {},
          );
          await commitSubscriptionUpdate(updateQuery);

          // Checkout-created subscriptions can emit this event before
          // checkout.session.completed. The invoice/Price currency can be
          // different from the customer's Adaptive Pricing charge, so the
          // Checkout event is the sole welcome-email trigger.
        }
        break;
      }

      case "customer.subscription.deleted": {
        console.log("⏳ Handling customer.subscription.deleted");
        const subscription = event.data.object as Stripe.Subscription;
        const subAny = subscription as any;
        const customerId = subAny.customer as string;

        const { data: profileRow, error: profileLookupError } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;

        if (profileRow) {
          const { error: deleteError } = await supabase
            .from("profiles")
            .update({
              subscription_status: "canceled",
              subscription_tier: "free",
              current_period_end: null,
              is_legacy_plan: false,
              paid_access_expires_at: null,
            })
            .eq("id", profileRow.id)
            .eq("stripe_subscription_id", subAny.id);
          if (deleteError) throw deleteError;
        }
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        console.log(`⏳ Handling ${event.type}`);
        await handlePaidSubscriptionInvoice(event.data.object as any);
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return res.json({ received: true });
  } catch (err: any) {
    if (err?.name === "SubscriptionConcurrentUpdateError") {
      return res.status(409).end();
    }
    console.error("❌ Error handling Stripe webhook:", err);
    reportCriticalEndpointFailure({
      error: err,
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
