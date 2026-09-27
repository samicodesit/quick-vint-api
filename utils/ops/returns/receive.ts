import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  inspectReturnSchema,
  receiveReturnSchema,
  restockReturnSchema,
  returnDetailSchema,
} from "../../../src/ops/contracts/returns";
import { check, userClient } from "../inventory/intake";
function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function recordReturnReceipt(
  actor: Actor,
  input: z.infer<typeof receiveReturnSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = receiveReturnSchema.parse(input);
  const { data, error } = await userClient(token).rpc(
    "ops_record_return_receipt",
    {
      p_workspace_id: actor.workspaceId,
      p_order_id: value.orderId,
      p_item_codes: value.itemCodes,
      p_key: meta.idempotencyKey,
    },
  );
  check(error);
  return data;
}
export async function inspectReturn(
  actor: Actor,
  input: z.infer<typeof inspectReturnSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = inspectReturnSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_inspect_return", {
    p_workspace_id: actor.workspaceId,
    p_return_line_id: value.returnLineId,
    p_decision: value.decision,
    p_note: value.note,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function restockReturn(
  actor: Actor,
  input: z.infer<typeof restockReturnSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = restockReturnSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_restock_return", {
    p_workspace_id: actor.workspaceId,
    p_return_line_id: value.returnLineId,
    p_location_id: value.locationId,
    p_expected_item_version: meta.expectedVersion,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function listReturns(actor: Actor) {
  const { data, error } = await serviceClient()
    .from("ops_returns")
    .select(
      "id,order_id,status,received_at,ops_return_lines(id,item_id,status)",
    )
    .eq("workspace_id", actor.workspaceId)
    .order("received_at", { ascending: false })
    .limit(100);
  check(error);
  return data ?? [];
}
export async function returnDetail(
  actor: Actor,
  input: z.infer<typeof returnDetailSchema>,
) {
  const value = returnDetailSchema.parse(input),
    client = serviceClient();
  const [received, lines] = await Promise.all([
    client
      .from("ops_returns")
      .select("id,order_id,status,received_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", value.returnId)
      .maybeSingle(),
    client
      .from("ops_return_lines")
      .select(
        "id,item_id,status,inspection_note,ops_items(display_sku,version,custody)",
      )
      .eq("workspace_id", actor.workspaceId)
      .eq("return_id", value.returnId),
  ]);
  check(received.error);
  check(lines.error);
  if (!received.data)
    throw Object.assign(new Error("Return not found"), {
      opsCode: "NOT_FOUND",
    });
  return { return: received.data, lines: lines.data ?? [] };
}
export async function reconcileCancellation(
  workspaceId: string,
  orderId: string,
) {
  const { data, error } = await serviceClient().rpc(
    "ops_reconcile_cancellation",
    {
      p_workspace_id: workspaceId,
      p_order_id: orderId,
      p_provider_status: "CANCELED",
    },
  );
  check(error);
  return data;
}
