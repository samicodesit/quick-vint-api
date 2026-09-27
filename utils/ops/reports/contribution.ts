export type Entry = {
  kind:
    | "seller_fee"
    | "shipping"
    | "packaging"
    | "refund"
    | "adjustment_credit"
    | "adjustment_debit";
  amountMinor: number;
  currency: string;
  source?: string;
  sourceKey?: string;
};
export type Line = {
  id: string;
  itemId: string | null;
  sellerRevenueMinor: number | null;
  acquisitionCostMinor: number | null;
  acquisitionCurrency: string | null;
  acquisitionBasis: string;
};
export type OrderSnapshot = {
  id: string;
  currency: string | null;
  sellerTotalMinor: number | null;
  lines: Line[];
  status: string;
};

export function allocateSellerRevenue(order: OrderSnapshot) {
  const total = order.sellerTotalMinor;
  if (
    total === null ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    order.lines.length === 0
  )
    return null;
  const observed = order.lines.reduce(
    (sum, line) => sum + (line.sellerRevenueMinor ?? 0),
    0,
  );
  if (observed > total) return null;
  const unknown = order.lines
    .filter((line) => line.sellerRevenueMinor === null)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (unknown.length === 0 && observed !== total) return null;
  const remainder = total - observed;
  const base = unknown.length ? Math.floor(remainder / unknown.length) : 0;
  const extra = unknown.length ? remainder % unknown.length : 0;
  const allocated = new Map(
    unknown.map((line, index) => [line.id, base + (index < extra ? 1 : 0)]),
  );
  return order.lines.map((line) => ({
    lineId: line.id,
    itemId: line.itemId,
    revenueMinor: line.sellerRevenueMinor ?? allocated.get(line.id)!,
    basis:
      line.sellerRevenueMinor === null
        ? ("equal_allocation" as const)
        : ("observed" as const),
  }));
}

export function calculateContribution(
  order: OrderSnapshot,
  entries: Entry[],
  chargedAcquisitionItemIds: Set<string> = new Set(),
) {
  const allocation = allocateSellerRevenue(order);
  if (!order.currency || allocation === null)
    return {
      status: "incomplete" as const,
      reason: "seller_revenue_unknown",
      currency: order.currency,
      contributionMinor: null,
      allocation,
    };
  if (entries.some((entry) => entry.currency !== order.currency))
    return {
      status: "incomplete" as const,
      reason: "mixed_currency_order",
      currency: order.currency,
      contributionMinor: null,
      allocation,
    };
  let acquisitionMinor = 0;
  for (const line of order.lines) {
    if (!line.itemId || chargedAcquisitionItemIds.has(line.itemId)) continue;
    if (
      line.acquisitionCostMinor === null ||
      line.acquisitionCurrency !== order.currency
    )
      return {
        status: "incomplete" as const,
        reason: "acquisition_unknown",
        currency: order.currency,
        contributionMinor: null,
        allocation,
      };
    acquisitionMinor += line.acquisitionCostMinor;
  }
  const costKinds = new Set([
    "seller_fee",
    "shipping",
    "packaging",
    "refund",
    "adjustment_debit",
  ]);
  const costsMinor = entries.reduce(
    (sum, entry) =>
      sum +
      (costKinds.has(entry.kind) ? entry.amountMinor : -entry.amountMinor),
    0,
  );
  return {
    status: "complete" as const,
    reason: null,
    currency: order.currency,
    revenueMinor: order.sellerTotalMinor!,
    acquisitionMinor,
    costsMinor,
    contributionMinor: order.sellerTotalMinor! - acquisitionMinor - costsMinor,
    allocation,
  };
}
