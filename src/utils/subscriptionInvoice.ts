type StripeIdLike = string | { id?: unknown } | null | undefined;

type InvoiceLike = {
  subscription?: StripeIdLike;
  parent?: {
    subscription_details?: { subscription?: StripeIdLike } | null;
  } | null;
  lines?: {
    data?: Array<{
      type?: string;
      proration?: boolean;
      parent?: {
        subscription_item_details?: { proration?: boolean } | null;
      } | null;
      period?: { start?: number; end?: number } | null;
    }>;
  } | null;
};

function getStripeId(value: StripeIdLike): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id || null;
  }
  return null;
}

export function getInvoiceSubscriptionId(invoice: InvoiceLike): string | null {
  return (
    getStripeId(invoice.parent?.subscription_details?.subscription) ||
    getStripeId(invoice.subscription)
  );
}

export function getPaidSubscriptionPeriod(
  invoice: InvoiceLike,
): { start: string; end: string } | null {
  const line = invoice.lines?.data?.find((candidate) => {
    const details = candidate.parent?.subscription_item_details;
    return details
      ? details.proration === false
      : candidate.type === "subscription" && candidate.proration !== true;
  });
  const start = line?.period?.start;
  const end = line?.period?.end;

  if (
    typeof start !== "number" ||
    !Number.isFinite(start) ||
    typeof end !== "number" ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return null;
  }

  return {
    start: new Date(start * 1000).toISOString(),
    end: new Date(end * 1000).toISOString(),
  };
}
