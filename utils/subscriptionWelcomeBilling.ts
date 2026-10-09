import type { PaidWelcomeBilling } from "./emailTemplates";

type WelcomeBillingInput = {
  subscription: any;
  status: string;
  checkoutSession?: any;
  invoice?: any;
  allowPriceFallback?: boolean;
};

function hasStripeDiscount(value: any): boolean {
  if (!value) return false;
  if (value.discount) return true;
  if (Array.isArray(value.discounts) && value.discounts.length > 0) {
    return true;
  }
  if (value.total_details?.amount_discount > 0) return true;
  return Array.isArray(value.total_details?.breakdown?.discounts)
    ? value.total_details.breakdown.discounts.length > 0
    : false;
}

function getPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function getValidCurrency(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z]{3}$/.test(value)
    ? value.toLowerCase()
    : null;
}

function getBillingPair(
  value: any,
  amountKey: string,
  currencyKey: string,
): [number | null, string | null] {
  const amount = getPositiveInteger(value?.[amountKey]);
  const currency = getValidCurrency(value?.[currencyKey]);
  return amount !== null && currency !== null
    ? [amount, currency]
    : [null, null];
}

function getSubscriptionCurrentPeriodEnd(subscription: any): string | null {
  const rawEnd =
    subscription?.items?.data?.[0]?.current_period_end ??
    subscription?.current_period_end;

  return typeof rawEnd === "number"
    ? new Date(rawEnd * 1000).toISOString()
    : null;
}

/**
 * Build customer-facing billing details from a Checkout Session or finalized
 * invoice. Stripe Price data is only used when explicitly allowed because it
 * can be in a different currency from an Adaptive Pricing charge.
 */
export function getWelcomeBillingDetails(
  input: WelcomeBillingInput,
): PaidWelcomeBilling | undefined {
  if (input.status !== "active" || input.subscription?.cancel_at_period_end) {
    return undefined;
  }

  const item = input.subscription?.items?.data?.[0];
  const price = item?.price;
  const discounted =
    hasStripeDiscount(input.subscription) ||
    hasStripeDiscount(input.checkoutSession) ||
    hasStripeDiscount(input.invoice);

  let amountMinor: number | null = null;
  let currency: string | null = null;
  let source: PaidWelcomeBilling["source"] = undefined;

  if (input.checkoutSession) {
    source = "checkout";
    if (!discounted) {
      const presentmentDetails =
        input.checkoutSession.presentment_details ?? null;
      [amountMinor, currency] = presentmentDetails
        ? getBillingPair(
            presentmentDetails,
            "presentment_amount",
            "presentment_currency",
          )
        : getBillingPair(input.checkoutSession, "amount_total", "currency");
    }
  } else if (input.invoice) {
    source = "invoice";
    if (!discounted) {
      const invoiceAmount =
        input.invoice.amount_paid ??
        input.invoice.amount_due ??
        input.invoice.total;
      [amountMinor, currency] = getBillingPair(
        { amount: invoiceAmount, currency: input.invoice.currency },
        "amount",
        "currency",
      );
    }
  } else if (input.allowPriceFallback) {
    source = "price";
    if (!discounted) {
      [amountMinor, currency] = getBillingPair(
        price,
        "unit_amount",
        "currency",
      );
    }
  }

  const nextRenewalAt = input.subscription?.cancel_at_period_end
    ? null
    : getSubscriptionCurrentPeriodEnd(input.subscription);
  const statementDescriptor =
    process.env.STRIPE_STATEMENT_DESCRIPTOR || "AUTOLISTER AI";

  if (!amountMinor && !nextRenewalAt && !statementDescriptor) return undefined;

  return {
    amountMinor,
    currency,
    nextRenewalAt,
    statementDescriptor,
    source,
  };
}

/**
 * Resolve billing evidence without falling back to a Stripe Price. This is
 * used by event handlers and retries so the welcome email cannot claim a
 * currency that differs from the customer-facing charge.
 */
export async function resolveWelcomeBillingDetails(input: {
  stripe: { invoices?: { retrieve: (id: string) => Promise<any> } };
  subscription: any;
  status: string;
  checkoutSession?: any;
  allowPriceFallback?: boolean;
}): Promise<PaidWelcomeBilling | undefined> {
  if (input.checkoutSession) {
    return getWelcomeBillingDetails(input);
  }

  const latestInvoice = input.subscription?.latest_invoice;
  if (latestInvoice && typeof latestInvoice === "object") {
    return getWelcomeBillingDetails({ ...input, invoice: latestInvoice });
  }

  if (typeof latestInvoice === "string" && input.stripe.invoices?.retrieve) {
    try {
      const invoice = await input.stripe.invoices.retrieve(latestInvoice);
      return getWelcomeBillingDetails({ ...input, invoice });
    } catch (error) {
      console.error(
        "Failed to retrieve invoice for subscription welcome email:",
        error,
      );
      return undefined;
    }
  }

  if (input.allowPriceFallback) {
    return getWelcomeBillingDetails(input);
  }

  return undefined;
}

export function isSendableWelcomeSubscription(subscription: any): boolean {
  return (
    subscription?.status === "active" &&
    subscription?.cancel_at_period_end !== true
  );
}

export function hasCustomerFacingWelcomeBilling(
  billing?: PaidWelcomeBilling,
): boolean {
  return billing?.source === "checkout" || billing?.source === "invoice";
}
