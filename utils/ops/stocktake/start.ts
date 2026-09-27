import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  observeStocktakeSchema,
  resolveStocktakeSchema,
  startStocktakeSchema,
  stocktakeIdSchema,
} from "../../../src/ops/contracts/stocktake";
import { check, userClient } from "../inventory/intake";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function startStocktake(
  actor: Actor,
  input: z.infer<typeof startStocktakeSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = startStocktakeSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_start_stocktake", {
    p_workspace_id: actor.workspaceId,
    p_location_id: value.locationId,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function observeStocktake(
  actor: Actor,
  input: z.infer<typeof observeStocktakeSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = observeStocktakeSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_observe_stocktake", {
    p_workspace_id: actor.workspaceId,
    p_stocktake_id: value.stocktakeId,
    p_item_code: value.itemCode,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function compareStocktake(
  actor: Actor,
  input: z.infer<typeof stocktakeIdSchema>,
  token: string,
) {
  const value = stocktakeIdSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_compare_stocktake", {
    p_workspace_id: actor.workspaceId,
    p_stocktake_id: value.stocktakeId,
  });
  check(error);
  return data;
}
export async function resolveDiscrepancy(
  actor: Actor,
  input: z.infer<typeof resolveStocktakeSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = resolveStocktakeSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_resolve_stocktake", {
    p_workspace_id: actor.workspaceId,
    p_stocktake_id: value.stocktakeId,
    p_item_id: value.itemId,
    p_decision: value.decision,
    p_note: value.note,
    p_expected_version: meta.expectedVersion,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function listStocktakes(actor: Actor) {
  const { data, error } = await serviceClient()
    .from("ops_stocktakes")
    .select("id,location_id,status,started_at,ops_locations(code)")
    .eq("workspace_id", actor.workspaceId)
    .order("started_at", { ascending: false })
    .limit(100);
  check(error);
  return data ?? [];
}
export async function closeStocktake(actor: Actor, input: z.infer<typeof stocktakeIdSchema>, meta: CommandMeta, token: string) {
  const value = stocktakeIdSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_close_stocktake", { p_workspace_id: actor.workspaceId, p_stocktake_id: value.stocktakeId, p_key: meta.idempotencyKey });
  check(error); return data;
}
