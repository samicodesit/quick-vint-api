import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  addIdentifierSchema,
  allocateLotSchema,
  correctItemCostSchema,
  createItemSchema,
  createLotSchema,
} from "../../../src/ops/contracts/inventory";
import { OpsError } from "../core/errors";

type CreateItem = z.infer<typeof createItemSchema>;
type AddIdentifier = z.infer<typeof addIdentifierSchema>;
type CreateLot = z.infer<typeof createLotSchema>;
type AllocateLot = z.infer<typeof allocateLotSchema>;
type CorrectItemCost = z.infer<typeof correctItemCostSchema>;

export function userClient(token: string) {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    throw new Error("OS Supabase configuration is incomplete");
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function readClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error("OS Supabase configuration is incomplete");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (["23505", "40001"].includes(error.code ?? ""))
    throw new OpsError("CONFLICT", error.message);
  if (error.code === "42501")
    throw new OpsError("FORBIDDEN", "Workspace access denied");
  if (["22023", "23514", "23503"].includes(error.code ?? ""))
    throw new OpsError("VALIDATION", error.message);
  throw new Error(error.message);
}

export type InventoryServices = {
  createItem(
    actor: Actor,
    input: CreateItem,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  addIdentifier(
    actor: Actor,
    input: AddIdentifier,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  createLot(
    actor: Actor,
    input: CreateLot,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  allocateLotCost(
    actor: Actor,
    input: AllocateLot,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  correctItemCost(
    actor: Actor,
    input: CorrectItemCost,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  listItems(actor: Actor, limit: number, token: string): Promise<unknown>;
  itemDetail(actor: Actor, itemId: string, token: string): Promise<unknown>;
  lotDetail(actor: Actor, lotId: string, token: string): Promise<unknown>;
};

export const defaultInventoryServices: InventoryServices = {
  async createItem(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_create_item", {
      p_workspace_id: actor.workspaceId,
      p_existing_sku: input.existingSku ?? null,
      p_source_id: input.sourceId ?? null,
      p_lot_id: input.lotId ?? null,
      p_key: meta.idempotencyKey,
    });
    check(error);
    return data;
  },
  async addIdentifier(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_add_identifier", {
      p_workspace_id: actor.workspaceId,
      p_item_id: input.itemId,
      p_kind: input.kind,
      p_value: input.value,
      p_key: meta.idempotencyKey,
      p_expected_version: meta.expectedVersion,
    });
    check(error);
    return data;
  },
  async createLot(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_create_lot", {
      p_workspace_id: actor.workspaceId,
      p_name: input.name,
      p_total_cost_minor: input.totalCostMinor,
      p_currency: input.currency,
      p_supplier_id: input.supplierId ?? null,
      p_key: meta.idempotencyKey,
    });
    check(error);
    return data;
  },
  async allocateLotCost(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_allocate_lot_cost",
      {
        p_workspace_id: actor.workspaceId,
        p_lot_id: input.lotId,
        p_overrides: input.overrides,
        p_key: meta.idempotencyKey,
        p_expected_version: meta.expectedVersion,
      },
    );
    check(error);
    return data;
  },
  async correctItemCost(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_correct_item_cost",
      {
        p_workspace_id: actor.workspaceId,
        p_item_id: input.itemId,
        p_cost_minor: input.costMinor,
        p_currency: input.currency,
        p_reason: input.reason,
        p_key: meta.idempotencyKey,
        p_expected_version: meta.expectedVersion,
      },
    );
    check(error);
    return data;
  },
  async listItems(actor, limit, token) {
    void token;
    const { data, error } = await readClient()
      .from("ops_items")
      .select("*")
      .eq("workspace_id", actor.workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    check(error);
    return (data ?? []).map((row) => ({
      id: row.id,
      display_sku: row.display_sku,
      custody: row.custody,
      preparation: row.preparation,
      version: row.version,
      created_at: row.created_at,
      ...(actor.role === "owner" || actor.role === "manager"
        ? { cost_minor: row.cost_minor, cost_currency: row.cost_currency }
        : {}),
    }));
  },
  async itemDetail(actor, itemId, token) {
    void token;
    const client = readClient();
    const { data, error } = await client
      .from("ops_items")
      .select("*")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", itemId)
      .maybeSingle();
    check(error);
    if (!data) throw new OpsError("NOT_FOUND", "Item not found");
    const { data: identifiers, error: identifierError } = await client
      .from("ops_item_identifiers")
      .select("kind,value")
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", itemId);
    check(identifierError);
    return {
      id: data.id,
      display_sku: data.display_sku,
      source_id: data.source_id,
      lot_id: data.lot_id,
      location_id: data.location_id,
      custody: data.custody,
      preparation: data.preparation,
      version: data.version,
      created_at: data.created_at,
      ops_item_identifiers: identifiers ?? [],
      ...(actor.role === "owner" || actor.role === "manager"
        ? { cost_minor: data.cost_minor, cost_currency: data.cost_currency }
        : {}),
    };
  },
  async lotDetail(actor, lotId, token) {
    void token;
    const client = readClient();
    const { data: lot, error } = await client
      .from("ops_lots")
      .select("*")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", lotId)
      .maybeSingle();
    check(error);
    if (!lot) throw new OpsError("NOT_FOUND", "Lot not found");
    const { data: items, error: itemsError } = await client
      .from("ops_items")
      .select("*")
      .eq("workspace_id", actor.workspaceId)
      .eq("lot_id", lotId)
      .order("id");
    check(itemsError);
    const canSeeCost = actor.role === "owner" || actor.role === "manager";
    return {
      id: lot.id,
      name: lot.name,
      version: lot.version,
      ...(canSeeCost
        ? { total_cost_minor: lot.total_cost_minor, currency: lot.currency }
        : {}),
      items: (items ?? []).map((row) => ({
        id: row.id,
        display_sku: row.display_sku,
        version: row.version,
        ...(canSeeCost
          ? { cost_minor: row.cost_minor, cost_currency: row.cost_currency }
          : {}),
      })),
    };
  },
};
