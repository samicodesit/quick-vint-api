import type { Money, OpsErrorCode } from "./core";

export type ExternalId = string;
export type CapabilityName =
  | "prepareListing"
  | "publish"
  | "readItems"
  | "readOrders"
  | "labels"
  | "withdraw";
export type Capability = {
  supported: boolean;
  verifiedAt: string | null;
  reason: string | null;
};
export type ProviderMode =
  | "manual"
  | "vinted_assisted"
  | "vinted_official"
  | "fixture";
export type ChannelContext = { workspaceId: string; channelAccountId: string };
export type ApprovedPublication = {
  itemId: string;
  listingId: string;
  revisionId: string;
  reference: string;
  title: string;
  description: string;
  facts: Record<string, string | number>;
  assetIds: string[];
  price: Money;
  ontologyVersion: string;
};
export type PublishReceipt = {
  state: "pending_confirmation" | "live" | "uncertain";
  externalListingId: ExternalId | null;
  providerRequestId: string | null;
};
export type NormalizedOrder = {
  externalOrderId: ExternalId;
  observedAt: string;
  rawStatus: string;
  eligibleForFulfillment: boolean;
  currency: string;
  lines: Array<{
    externalLineId: ExternalId;
    externalListingId: ExternalId | null;
    itemReference: string | null;
    titleSnapshot: string;
    sellerItemRevenueMinor: number | null;
  }>;
};
export type OrderPage = {
  orders: NormalizedOrder[];
  nextCursor: string | null;
};
export type LabelDocument = {
  externalOrderId: ExternalId;
  externalShipmentId: ExternalId;
  providerLabelRevision: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
};
export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: OpsErrorCode; message: string; retryAfterMs?: number };

export interface MarketplaceAdapter {
  capabilities(
    ctx: ChannelContext,
  ): Promise<Record<CapabilityName, Capability>>;
  publish(
    ctx: ChannelContext,
    item: ApprovedPublication,
  ): Promise<AdapterResult<PublishReceipt>>;
  listOrders(
    ctx: ChannelContext,
    cursor: string | null,
  ): Promise<AdapterResult<OrderPage>>;
  getOrder(
    ctx: ChannelContext,
    id: ExternalId,
  ): Promise<AdapterResult<NormalizedOrder>>;
  getLabel(
    ctx: ChannelContext,
    id: ExternalId,
  ): Promise<AdapterResult<LabelDocument>>;
  reconcilePublication(
    ctx: ChannelContext,
    reference: string,
  ): Promise<AdapterResult<PublishReceipt>>;
}
