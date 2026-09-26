import type { PublishReceipt } from "../../../../src/ops/contracts/integrations";
import type { VintedClient } from "./client";
import { findByReference, getItemStatus } from "./items";

export async function reconcilePublication(
  client: VintedClient,
  reference: string,
): Promise<PublishReceipt> {
  const matches = await findByReference(client, reference);
  if (matches.length !== 1)
    return {
      state: "uncertain",
      externalListingId: null,
      providerRequestId: null,
    };
  const match = matches[0] as { item_id?: string };
  if (!match.item_id)
    return {
      state: "uncertain",
      externalListingId: null,
      providerRequestId: null,
    };
  const status = (await getItemStatus(client, match.item_id)) as {
    status?: string;
  };
  return {
    state: status.status === "ACTIVE" ? "live" : "pending_confirmation",
    externalListingId: match.item_id,
    providerRequestId: null,
  };
}
