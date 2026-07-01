import type Stripe from "stripe";
import { supabase } from "./supabaseClient";

type StripeClient = Stripe;

type CreatePortalInput = {
  stripe: StripeClient;
  email: string;
  customerId: string;
  subscriptionId?: string | null;
  returnUrl: string;
  context: string;
};

function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

function getCustomerId(customer: string | { id?: string } | null | undefined) {
  return typeof customer === "string" ? customer : customer?.id || "";
}

function getCustomerEmail(customer: Stripe.Customer | Stripe.DeletedCustomer) {
  if ("deleted" in customer && customer.deleted) return "";
  return customer.email || "";
}

async function persistResolvedCustomerId(email: string, customerId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .ilike("email", email);

  if (error) {
    console.error("Failed to repair stripe_customer_id:", {
      email,
      customerId,
      error,
    });
  }
}

export async function createBillingPortalSessionForProfile({
  stripe,
  email,
  customerId,
  subscriptionId,
  returnUrl,
  context,
}: CreatePortalInput) {
  let portalCustomerId = customerId;

  const portalSessionConfig: Stripe.BillingPortal.SessionCreateParams = {
    customer: portalCustomerId,
    return_url: returnUrl,
  };

  if (!subscriptionId) {
    return stripe.billingPortal.sessions.create(portalSessionConfig);
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionCustomerId = getCustomerId(subscription.customer);

  if (!subscriptionCustomerId) {
    throw new Error("Stripe subscription has no customer.");
  }

  if (subscriptionCustomerId !== customerId) {
    const subscriptionCustomer =
      await stripe.customers.retrieve(subscriptionCustomerId);
    const subscriptionCustomerEmail = getCustomerEmail(subscriptionCustomer);

    if (normalizeEmail(subscriptionCustomerEmail) !== normalizeEmail(email)) {
      console.error("Stripe customer/subscription mismatch:", {
        context,
        email,
        storedCustomerId: customerId,
        subscriptionId,
        subscriptionCustomerId,
        subscriptionCustomerEmail,
      });
      throw new Error(
        "Your billing record is out of sync. Please contact support.",
      );
    }

    console.warn("Repairing mismatched Stripe customer for subscription:", {
      context,
      email,
      storedCustomerId: customerId,
      subscriptionId,
      subscriptionCustomerId,
    });
    portalCustomerId = subscriptionCustomerId;
    portalSessionConfig.customer = portalCustomerId;
    await persistResolvedCustomerId(email, portalCustomerId);
  }

  portalSessionConfig.flow_data = {
    type: "subscription_update",
    subscription_update: {
      subscription: subscriptionId,
    },
  };

  return stripe.billingPortal.sessions.create(portalSessionConfig);
}
