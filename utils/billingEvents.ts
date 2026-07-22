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
    raw_event: {
      stripeEventId: event.id,
      objectId: object.id || null,
      objectType: object.object || null,
    },
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
  await logBillingEvent(buildStripeBillingEventRow(input));
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
