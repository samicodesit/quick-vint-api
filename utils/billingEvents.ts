import type Stripe from "stripe";
import { supabase } from "./supabaseClient";

type BillingEventSource = "stripe_webhook" | "admin" | "reconciliation";

type BillingEventRow = {
  user_id?: string | null;
  user_email?: string | null;
  source: BillingEventSource;
  event_type: string;
  stripe_event_id?: string | null;
  stripe_event_created_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_invoice_id?: string | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: string | null;
  cancel_at?: string | null;
  current_period_end?: string | null;
  amount_due?: number | null;
  amount_remaining?: number | null;
  currency?: string | null;
  attempt_count?: number | null;
  next_payment_attempt?: string | null;
  billing_reason?: string | null;
  drift_reasons?: string[] | null;
  raw_event?: Record<string, unknown> | null;
};

type ProfileBillingSnapshot = {
  subscription_status?: string | null;
  subscription_tier?: string | null;
};

type StripeBillingSnapshot = {
  activeLikeSubscriptionCount: number;
  collectibleInvoiceCount: number;
  collectibleAmountRemaining: number;
  hasCancelAtPeriodEnd: boolean;
};

function timestampToIso(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function getStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id || "") || null;
  }
  return null;
}

function getStripeObject(event: Stripe.Event) {
  return event.data.object as Record<string, any>;
}

function getInvoiceSubscriptionId(object: Record<string, any>) {
  return (
    getStripeId(object.subscription) ||
    getStripeId(object.parent?.subscription_details?.subscription)
  );
}

function priceEvidence(item: Record<string, any>) {
  const price = item.price || item.pricing?.price_details || {};
  return {
    id: item.id || null,
    price_id: getStripeId(price.price) || price.id || null,
    product_id: getStripeId(price.product),
    quantity: item.quantity ?? null,
    unit_amount: price.unit_amount ?? null,
    amount: item.amount ?? null,
    currency: price.currency || item.currency || null,
    recurring: price.recurring
      ? {
          interval: price.recurring.interval,
          interval_count: price.recurring.interval_count,
        }
      : null,
    period: item.period || null,
    current_period_start: item.current_period_start ?? null,
    current_period_end: item.current_period_end ?? null,
  };
}

// Only signed event data belongs here. Never backfill current copy or infer consent.
function buildBillingEvidence(
  event: Stripe.Event,
  object: Record<string, any>,
) {
  const previous = event.data.previous_attributes as
    | Record<string, any>
    | undefined;
  return {
    schema_version: 1,
    stripeEventId: event.id,
    objectId: object.id || null,
    objectType: object.object || null,
    api_version: event.api_version || null,
    livemode: event.livemode,
    stripe_request_id: event.request?.id || null,
    consent: object.consent || null,
    consent_collection: object.consent_collection || null,
    custom_text: object.custom_text || null,
    policy: {
      version: object.metadata?.billing_policy_version || null,
      url: object.metadata?.billing_policy_url || null,
      sha256: object.metadata?.billing_policy_sha256 || null,
    },
    amount_total: object.amount_total ?? null,
    amount_paid: object.amount_paid ?? null,
    amount_refunded: object.amount_refunded ?? null,
    currency: object.currency || null,
    presentment_details: object.presentment_details || null,
    total_details: object.total_details || null,
    payment_status: object.payment_status || null,
    invoice_id: getStripeId(object.invoice),
    payment_intent_id: getStripeId(object.payment_intent),
    invoice_number: object.number || null,
    period_start: object.period_start ?? null,
    period_end: object.period_end ?? null,
    items: (object.items?.data || object.lines?.data || []).map(priceEvidence),
    cancellation: {
      cancel_at_period_end: object.cancel_at_period_end ?? null,
      canceled_at: object.canceled_at ?? null,
      cancel_at: object.cancel_at ?? null,
      ended_at: object.ended_at ?? null,
      reason: object.cancellation_details?.reason || null,
      feedback: object.cancellation_details?.feedback || null,
      comment: object.cancellation_details?.comment || null,
      previous_cancel_at_period_end: previous?.cancel_at_period_end ?? null,
      previous_cancel_at: previous?.cancel_at ?? null,
    },
  };
}

export function buildStripeBillingEventRow({
  event,
  profileId,
  email,
}: {
  event: Stripe.Event;
  profileId?: string | null;
  email?: string | null;
}): BillingEventRow {
  const object = getStripeObject(event);
  const objectType = String(object.object || "");
  const isInvoice = objectType === "invoice";
  const isSubscription = objectType === "subscription";
  const isCheckoutSession = objectType === "checkout.session";

  const customerId = getStripeId(object.customer);
  const subscriptionId = isInvoice
    ? getInvoiceSubscriptionId(object)
    : getStripeId(isCheckoutSession ? object.subscription : object.id);

  return {
    user_id: profileId || null,
    user_email: email || object.customer_details?.email || object.email || null,
    source: "stripe_webhook",
    event_type: event.type,
    stripe_event_id: event.id || null,
    stripe_event_created_at: timestampToIso(event.created),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_invoice_id: isInvoice ? object.id || null : null,
    status: object.status || object.payment_status || null,
    cancel_at_period_end: isSubscription
      ? Boolean(object.cancel_at_period_end)
      : null,
    canceled_at: timestampToIso(object.canceled_at),
    cancel_at: timestampToIso(object.cancel_at),
    current_period_end: timestampToIso(
      object.current_period_end || object.items?.data?.[0]?.current_period_end,
    ),
    amount_due: isInvoice ? (object.amount_due ?? null) : null,
    amount_remaining: isInvoice ? (object.amount_remaining ?? null) : null,
    currency: object.currency || null,
    attempt_count: isInvoice ? (object.attempt_count ?? null) : null,
    next_payment_attempt: timestampToIso(object.next_payment_attempt),
    billing_reason: isInvoice ? object.billing_reason || null : null,
    raw_event: buildBillingEvidence(event, object),
  };
}

export async function logBillingEvent(row: BillingEventRow) {
  try {
    const { error } = await supabase.from("billing_events").insert([row]);
    if (error) {
      console.error("Failed to log billing event:", error);
    }
  } catch (error) {
    console.error("Error in logBillingEvent:", error);
  }
}

export async function logStripeBillingEvent(input: {
  event: Stripe.Event;
  profileId?: string | null;
  email?: string | null;
}) {
  const { error } = await supabase
    .from("billing_events")
    .insert([buildStripeBillingEventRow(input)]);
  // Stripe retries the signed event if persistence fails. Duplicate delivery is safe.
  if (error && error.code !== "23505") throw error;
}

export async function logAdminBillingAction({
  action,
  profileId,
  email,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeInvoiceId,
  before,
  after,
  metadata,
}: {
  action: string;
  profileId?: string | null;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  await logBillingEvent({
    user_id: profileId || null,
    user_email: email || null,
    source: "admin",
    event_type: `admin.billing.${action}`,
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
    stripe_invoice_id: stripeInvoiceId || null,
    raw_event: { action, before, after, metadata },
  });
}

export function getBillingDriftReasons({
  profile,
  stripe,
}: {
  profile: ProfileBillingSnapshot;
  stripe: StripeBillingSnapshot;
}) {
  const status = profile.subscription_status || "free";
  const tier = profile.subscription_tier || "free";
  const isPaidProfile = tier !== "free" && status !== "canceled";
  const isFreeOrCanceled = tier === "free" || status === "canceled";
  const reasons: string[] = [];

  if (isPaidProfile && stripe.activeLikeSubscriptionCount === 0) {
    reasons.push("paid_profile_without_active_stripe_subscription");
  }

  if (isFreeOrCanceled && stripe.collectibleInvoiceCount > 0) {
    reasons.push("open_invoice_for_free_or_canceled_profile");
  }

  if (
    status === "active" &&
    stripe.hasCancelAtPeriodEnd &&
    stripe.activeLikeSubscriptionCount > 0
  ) {
    reasons.push("profile_missing_canceling_status");
  }

  return reasons;
}
