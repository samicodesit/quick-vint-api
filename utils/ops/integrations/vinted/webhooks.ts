import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { parseVintedJson } from "./client";
import { verifyVintedWebhook } from "./signing";

export type VerifiedVintedEvent = {
  webhookId: string;
  bodySha256: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export function decodeVintedWebhook(
  rawBody: Uint8Array,
  signature: string | null,
  expectedWebhookId: string,
  signingKey: string,
  nowSeconds: number,
): VerifiedVintedEvent {
  const valid = verifyVintedWebhook(signingKey, rawBody, signature, nowSeconds);
  if (!valid.valid)
    throw new Error("Invalid or expired Vinted webhook signature");
  const payload = parseVintedJson(new TextDecoder().decode(rawBody)) as Record<
    string,
    unknown
  >;
  if (
    payload.webhook_id !== expectedWebhookId ||
    typeof payload.event_type !== "string" ||
    !payload.event_data
  )
    throw new Error("Vinted webhook identity or payload is invalid");
  return {
    webhookId: expectedWebhookId,
    bodySha256: createHash("sha256").update(rawBody).digest("hex"),
    eventType: payload.event_type,
    payload,
  };
}

export function eventNeedsReconciliation(event: VerifiedVintedEvent): boolean {
  return [
    "CREATE_ITEM_SUCCESS",
    "CREATE_ITEM_FAILURE",
    "ITEM_PUBLISHED",
    "ITEM_SOLD",
    "ORDER_CREATED",
    "ORDER_CANCELLED",
    "SHIPMENT_LABEL_CREATED",
    "VINTED_AUTHENTICATION_ERROR",
    "ITEM_REUPLOADED",
    "ITEM_DELETED",
  ].includes(event.eventType);
}
