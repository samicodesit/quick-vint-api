import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  attachLabelSchema,
  handoverSchema,
  packDetailSchema,
  scanPackSchema,
  startPackSchema,
} from "../../../src/ops/contracts/pack";
import { check, userClient } from "../inventory/intake";
function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function startPack(
  actor: Actor,
  input: z.infer<typeof startPackSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = startPackSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_start_pack", {
    p_workspace_id: actor.workspaceId,
    p_order_id: value.orderId,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function scanPackItem(
  actor: Actor,
  input: z.infer<typeof scanPackSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = scanPackSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_scan_pack_item", {
    p_workspace_id: actor.workspaceId,
    p_session_id: value.sessionId,
    p_item_code: value.itemCode,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function attachLabel(
  actor: Actor,
  input: z.infer<typeof attachLabelSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = attachLabelSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_attach_label", {
    p_workspace_id: actor.workspaceId,
    p_session_id: value.sessionId,
    p_label_id: value.labelId,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function recordHandover(
  actor: Actor,
  input: z.infer<typeof handoverSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = handoverSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_record_handover", {
    p_workspace_id: actor.workspaceId,
    p_shipment_id: value.shipmentId,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function packDetail(
  actor: Actor,
  input: z.infer<typeof packDetailSchema>,
) {
  const value = packDetailSchema.parse(input),
    client = serviceClient();
  const [session, lines, labels] = await Promise.all([
    client
      .from("ops_pack_sessions")
      .select("id,order_id,shipment_id,status,label_id,actor_user_id")
      .eq("workspace_id", actor.workspaceId)
      .eq("order_id", value.orderId)
      .maybeSingle(),
    client
      .from("ops_order_lines")
      .select("id,item_id,item_code_snapshot,title_snapshot")
      .eq("workspace_id", actor.workspaceId)
      .eq("order_id", value.orderId),
    client
      .from("ops_labels")
      .select("id,order_id,source,provider_revision,created_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("order_id", value.orderId)
      .order("created_at", { ascending: false }),
  ]);
  check(session.error);
  check(lines.error);
  check(labels.error);
  if (!session.data)
    return {
      session: null,
      lines: lines.data ?? [],
      scans: [],
      labels: labels.data ?? [],
    };
  const { data: scans, error } = await client
    .from("ops_pack_scans")
    .select("id,line_id,item_id,scanned_at")
    .eq("workspace_id", actor.workspaceId)
    .eq("session_id", session.data.id);
  check(error);
  return {
    session: session.data,
    lines: lines.data ?? [],
    scans: scans ?? [],
    labels: labels.data ?? [],
  };
}
