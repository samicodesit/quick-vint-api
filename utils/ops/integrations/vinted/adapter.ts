import type {
  AdapterResult,
  ApprovedPublication,
  CapabilityName,
  ChannelContext,
  MarketplaceAdapter,
  PublishReceipt,
} from "../../../../src/ops/contracts/integrations";
import { unsupportedCapabilities } from "../capabilities";
import { VintedClient, type VintedEnvironment } from "./client";
import { createItems, type VintedItemInput } from "./items";
import { getOrderLabel } from "./labels";
import { fetchOntology } from "./ontology";
import { getOrder, listOrders } from "./orders";
import { reconcilePublication } from "./reconcile";
import type { VintedKeys } from "./signing";

export type VerifiedVintedConnection = {
  environment: VintedEnvironment;
  keys: VintedKeys;
  verifiedAt: string | null;
  capabilities: Partial<Record<CapabilityName, boolean>>;
  slotLimit: number | null;
  activeSlots: number | null;
};

export type VintedAdapterDependencies = {
  resolve(ctx: ChannelContext): Promise<VerifiedVintedConnection | null>;
  mapApproved(item: ApprovedPublication): Promise<VintedItemInput>;
  recordPending(ctx: ChannelContext, item: ApprovedPublication): Promise<void>;
  recordResult(
    ctx: ChannelContext,
    item: ApprovedPublication,
    receipt: PublishReceipt,
  ): Promise<void>;
  makeClient?(connection: VerifiedVintedConnection): VintedClient;
};

const unavailable = <T>(message: string): AdapterResult<T> => ({
  ok: false,
  code: "UNSUPPORTED",
  message,
});
const uncertain = <T>(message: string): AdapterResult<T> => ({
  ok: false,
  code: "EXTERNAL_UNCERTAIN",
  message,
});

export function createVintedOfficialAdapter(
  deps: VintedAdapterDependencies,
): MarketplaceAdapter {
  const client = (connection: VerifiedVintedConnection) =>
    deps.makeClient?.(connection) ??
    new VintedClient(connection.keys, connection.environment);
  async function access(ctx: ChannelContext, capability: CapabilityName) {
    const connection = await deps.resolve(ctx);
    return connection?.verifiedAt && connection.capabilities[capability]
      ? connection
      : null;
  }
  return {
    async capabilities(ctx) {
      const connection = await deps.resolve(ctx);
      const result = unsupportedCapabilities(
        "Vinted Pro account access and dev-mode capability verification required",
      );
      if (connection?.verifiedAt)
        for (const name of Object.keys(result) as CapabilityName[])
          if (connection.capabilities[name])
            result[name] = {
              supported: true,
              verifiedAt: connection.verifiedAt,
              reason: null,
            };
      return result;
    },
    async publish(ctx, item) {
      const connection = await access(ctx, "publish");
      if (!connection)
        return unavailable(
          "Vinted Pro publishing has not been verified for this account",
        );
      if (connection.slotLimit === null || connection.activeSlots === null)
        return unavailable("Vinted Pro active slot count is unknown");
      // Persist before remote send. Timeout means reconciliation by reference, never a blind retry.
      await deps.recordPending(ctx, item);
      try {
        const api = client(connection);
        const ontology = await fetchOntology(api);
        const mapped = await deps.mapApproved(item);
        const accepted = await createItems(
          api,
          [mapped],
          item.ontologyVersion,
          ontology,
          {
            active: connection.activeSlots,
            limit: connection.slotLimit,
          },
        );
        const receipt: PublishReceipt = {
          state: "pending_confirmation",
          externalListingId: accepted[0].item_id,
          providerRequestId: null,
        };
        await deps.recordResult(ctx, item, receipt);
        return { ok: true, value: receipt };
      } catch {
        const receipt: PublishReceipt = {
          state: "uncertain",
          externalListingId: null,
          providerRequestId: null,
        };
        await deps.recordResult(ctx, item, receipt);
        return uncertain(
          "Vinted create outcome is uncertain; reconcile by item reference before retrying",
        );
      }
    },
    async listOrders(ctx, cursor) {
      const connection = await access(ctx, "readOrders");
      if (!connection)
        return unavailable(
          "Vinted Pro order reads have not been verified for this account",
        );
      try {
        return {
          ok: true,
          value: await listOrders(client(connection), cursor),
        };
      } catch {
        return uncertain(
          "Vinted order read failed; retry with the same cursor",
        );
      }
    },
    async getOrder(ctx, id) {
      const connection = await access(ctx, "readOrders");
      if (!connection)
        return unavailable(
          "Vinted Pro order reads have not been verified for this account",
        );
      try {
        return { ok: true, value: await getOrder(client(connection), id) };
      } catch {
        return uncertain("Vinted order read failed");
      }
    },
    async getLabel(ctx, id) {
      const connection = await access(ctx, "labels");
      if (!connection)
        return unavailable(
          "Vinted Pro labels have not been verified for this account",
        );
      try {
        return { ok: true, value: await getOrderLabel(client(connection), id) };
      } catch {
        return uncertain("Vinted label is not ready or could not be retrieved");
      }
    },
    async reconcilePublication(ctx, reference) {
      const connection = await access(ctx, "readItems");
      if (!connection)
        return unavailable(
          "Vinted Pro item reads have not been verified for this account",
        );
      try {
        return {
          ok: true,
          value: await reconcilePublication(client(connection), reference),
        };
      } catch {
        return uncertain("Vinted publication status could not be checked");
      }
    },
  };
}
