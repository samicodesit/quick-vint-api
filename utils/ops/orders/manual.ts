import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  manualOrderSchema,
  orderListSchema,
  reserveOrderSchema,
} from "../../../src/ops/contracts/orders";
import { OpsError } from "../core/errors";
import { check, userClient } from "../inventory/intake";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createManualOrder(
  actor: Actor,
  input: z.infer<typeof manualOrderSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = manualOrderSchema.parse(input);
  const { data, error } = await userClient(token).rpc(
    "ops_create_manual_order",
    {
      p_workspace_id: actor.workspaceId,
      p_paid_confirmed: value.paidConfirmed,
      p_currency: value.currency,
      p_seller_total_minor: value.sellerTotalMinor,
      p_lines: value.lines,
      p_key: meta.idempotencyKey,
      p_ship_by_at: value.shipByAt ?? null,
    },
  );
  check(error);
  return data;
}

export async function reserveOrder(
  actor: Actor,
  input: z.infer<typeof reserveOrderSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = reserveOrderSchema.parse(input);
  if (meta.expectedVersion === null)
    throw new OpsError("VALIDATION", "Expected order version required");
  const { data, error } = await userClient(token).rpc("ops_reserve_order", {
    p_workspace_id: actor.workspaceId,
    p_order_id: value.orderId,
    p_expected_version: meta.expectedVersion,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}

export async function listOrders(
  actor: Actor,
  input: z.infer<typeof orderListSchema>,
) {
  const value = orderListSchema.parse(input);
  let query = serviceClient()
    .from("ops_orders")
    .select(
      "id,source,status,raw_status,currency,seller_total_minor,ship_by_at,version,created_at,ops_order_lines(id,item_id,item_code_snapshot,title_snapshot)",
    )
    .eq("workspace_id", actor.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (value.status) query = query.eq("status", value.status);
  const { data, error } = await query;
  check(error);
  return (data ?? []).map((order) => ({
    ...order,
    seller_total_minor: ["owner", "manager"].includes(actor.role)
      ? order.seller_total_minor
      : null,
  }));
}

export async function orderDetail(actor: Actor, orderId: string) {
  const client = serviceClient();
  const { data: order, error } = await client
    .from("ops_orders")
    .select(
      "id,source,status,raw_status,currency,seller_total_minor,ship_by_at,version,created_at,external_order_id",
    )
    .eq("workspace_id", actor.workspaceId)
    .eq("id", orderId)
    .maybeSingle();
  check(error);
  if (!order)
    throw Object.assign(new Error("Order not found"), { opsCode: "NOT_FOUND" });
  const [lines, issues] = await Promise.all([
    client
      .from("ops_order_lines")
      .select(
        "id,item_id,item_code_snapshot,title_snapshot,seller_revenue_minor,external_line_id,external_item_id",
      )
      .eq("workspace_id", actor.workspaceId)
      .eq("order_id", orderId)
      .order("created_at"),
    client
      .from("ops_order_issues")
      .select("id,kind,detail,resolved_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("order_id", orderId),
  ]);
  check(lines.error);
  check(issues.error);
  const finance = ["owner", "manager"].includes(actor.role);
  return {
    ...order,
    seller_total_minor: finance ? order.seller_total_minor : null,
    lines: (lines.data ?? []).map((line) => ({
      ...line,
      seller_revenue_minor: finance ? line.seller_revenue_minor : null,
    })),
    issues: issues.data ?? [],
  };
}
