import { createClient } from "@supabase/supabase-js";
import type {
  ChannelContext,
  NormalizedOrder,
} from "../../../src/ops/contracts/integrations";
import { check } from "../inventory/intake";

export async function ingestOrder(
  ctx: ChannelContext,
  snapshot: NormalizedOrder & { sellerTotalMinor: number | null },
) {
  if (!/^\d+$/.test(snapshot.externalOrderId))
    throw new Error("Provider order ID must be exact decimal text");
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("ops_ingest_order", {
    p_workspace_id: ctx.workspaceId,
    p_connection_id: ctx.channelAccountId,
    p_external_order_id: snapshot.externalOrderId,
    p_raw_status: snapshot.rawStatus,
    p_observed_at: snapshot.observedAt,
    p_currency: snapshot.sellerTotalMinor === null ? null : snapshot.currency,
    p_seller_total_minor: snapshot.sellerTotalMinor,
    p_lines: snapshot.lines.map((line) => ({
      externalLineId: line.externalLineId,
      externalItemId: line.externalListingId,
      itemReference: line.itemReference,
      title: line.titleSnapshot,
    })),
  });
  check(error);
  return data;
}
