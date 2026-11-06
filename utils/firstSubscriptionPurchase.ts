import type Stripe from "stripe";
import { supabase } from "./supabaseClient";

// Read-only measurement. Tracking failures must never affect paid entitlements.
export async function firstSubscriptionPurchase(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  profileId: string | null,
) {
  if (
    !profileId ||
    !session.livemode ||
    session.mode !== "subscription" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    !(session.amount_total && session.amount_total > 0) ||
    typeof session.invoice !== "string" ||
    typeof session.customer !== "string"
  )
    return null;
  try {
    const invoice = await stripe.invoices.retrieve(session.invoice);
    const subscriptionId = (value: any) =>
      typeof value === "string" ? value : value?.id;
    const invoiceSubscription = (value: any) =>
      subscriptionId(
        value.parent?.subscription_details?.subscription || value.subscription,
      );
    if (
      !invoice.livemode ||
      invoice.status !== "paid" ||
      invoice.amount_paid <= 0 ||
      invoice.billing_reason !== "subscription_create" ||
      subscriptionId(invoice.customer) !== session.customer ||
      invoiceSubscription(invoice) !== subscriptionId(session.subscription)
    )
      return null;
    // Auto-pagination includes old subscriptions, not only the latest 100 invoices.
    for await (const previous of stripe.invoices.list({
      customer: session.customer,
      status: "paid",
      limit: 100,
    })) {
      if (
        previous.id !== invoice.id &&
        previous.created <= invoice.created &&
        previous.amount_paid > 0 &&
        invoiceSubscription(previous)
      )
        return null;
    }
    // Also reject paid history associated with an older Stripe customer ID.
    const { data, error } = await supabase
      .from("billing_events")
      .select("stripe_invoice_id")
      .eq("user_id", profileId)
      .eq("status", "paid")
      .gt("amount_due", 0)
      .not("stripe_subscription_id", "is", null)
      .neq("stripe_invoice_id", invoice.id)
      .lte(
        "stripe_event_created_at",
        new Date(invoice.created * 1000).toISOString(),
      )
      .limit(1);
    if (error || !data || data.length) return null;
    // EUR is the app's billing currency. Fail closed for unhandled minor-unit currencies.
    if (invoice.currency !== "eur") return null;
    return {
      transaction_id: invoice.id,
      value: invoice.amount_paid / 100,
      currency: "EUR",
      new_customer: true,
    };
  } catch {
    return null;
  }
}
