import type {
  NormalizedOrder,
  OrderPage,
} from "../../../../src/ops/contracts/integrations";
import type { VintedClient } from "./client";

const fulfillable = new Set(["READY_TO_BE_SHIPPED"]);
export function normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
  const id = String(raw.id ?? "");
  if (!/^\d+$/.test(id) || !Array.isArray(raw.items))
    throw new Error("Vinted order is missing its exact ID or items");
  const status = typeof raw.status === "string" ? raw.status : "UNKNOWN";
  const currency = typeof raw.currency === "string" ? raw.currency : "";
  return {
    externalOrderId: id,
    observedAt: String(raw.created_at ?? ""),
    rawStatus: status,
    eligibleForFulfillment: fulfillable.has(status),
    currency,
    lines: raw.items.map((entry: unknown, index: number) => {
      const item = entry as Record<string, unknown>;
      return {
        externalLineId: `${id}:${index}`,
        externalListingId: typeof item.id === "string" ? item.id : null,
        itemReference:
          typeof item.item_reference === "string" ? item.item_reference : null,
        titleSnapshot: String(item.title ?? ""),
        sellerItemRevenueMinor:
          typeof item.price === "number" ? Math.round(item.price * 100) : null,
      };
    }),
  };
}

export async function getOrder(
  client: VintedClient,
  id: string,
): Promise<NormalizedOrder> {
  if (!/^\d+$/.test(id)) throw new Error("Invalid Vinted order ID");
  const response = await client.request("GET", `/api/v1/orders/${id}`);
  if (
    response.status !== 200 ||
    !response.data ||
    typeof response.data !== "object"
  )
    throw new Error(`Vinted order unavailable (${response.status})`);
  return normalizeOrder(response.data as Record<string, unknown>);
}

export async function listOrders(
  client: VintedClient,
  cursor: string | null,
): Promise<OrderPage> {
  if (cursor !== null && !/^\d+$/.test(cursor))
    throw new Error("Invalid Vinted order cursor");
  const response = await client.request(
    "GET",
    `/api/v1/orders${cursor ? `?after-id=${cursor}` : ""}`,
  );
  if (response.status !== 200)
    throw new Error(`Vinted order list unavailable (${response.status})`);
  const rows = (response.data as { orders?: Array<{ id?: unknown }> }).orders;
  if (!Array.isArray(rows)) throw new Error("Vinted order list is incomplete");
  // The list endpoint has summaries only. Resolve each exact order before ingestion.
  const orders: NormalizedOrder[] = [];
  for (const row of rows)
    orders.push(await getOrder(client, String(row.id ?? "")));
  return {
    orders,
    nextCursor: rows.length === 250 ? String(rows.at(-1)?.id ?? "") : null,
  };
}
