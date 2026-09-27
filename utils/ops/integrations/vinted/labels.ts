import { TextDecoder } from "node:util";
import type { LabelDocument } from "../../../../src/ops/contracts/integrations";
import type { VintedClient } from "./client";

export async function getOrderLabel(
  client: VintedClient,
  orderId: string,
): Promise<LabelDocument> {
  if (!/^\d+$/.test(orderId)) throw new Error("Invalid Vinted order ID");
  const response = await client.request(
    "GET",
    `/api/v1/orders/${orderId}/shipment-label`,
  );
  if (response.status !== 200 || !(response.data instanceof Uint8Array))
    throw new Error(`Vinted label unavailable (${response.status})`);
  const bytes = response.data;
  if (
    bytes.length < 8 ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("Vinted label is not a PDF");
  return {
    externalOrderId: orderId,
    externalShipmentId: orderId,
    providerLabelRevision: `${response.headers.get("etag") ?? "unversioned"}`,
    mimeType: "application/pdf",
    bytes,
  };
}
