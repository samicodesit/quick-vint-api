import type { z } from "zod";
import type { Actor } from "../../../src/ops/contracts/core";
import { inventorySearchSchema } from "../../../src/ops/contracts/locations";
import { check, userClient } from "./intake";

type Filters = z.infer<typeof inventorySearchSchema>;
export type SearchServices = {
  listInventory(
    actor: Actor,
    filters: Filters,
    token: string,
  ): Promise<unknown>;
  resolveIdentifier(
    actor: Actor,
    code: string,
    token: string,
  ): Promise<unknown>;
  listLocations(actor: Actor, token: string): Promise<unknown>;
};

export const defaultSearchServices: SearchServices = {
  async listInventory(actor, filters, token) {
    const { data, error } = await userClient(token).rpc("ops_list_inventory", {
      p_workspace_id: actor.workspaceId,
      p_search: filters.search ?? null,
      p_custody: filters.custody ?? null,
      p_preparation: filters.preparation ?? null,
      p_location_id: filters.locationId ?? null,
      p_cursor_at: filters.cursor?.createdAt ?? null,
      p_cursor_id: filters.cursor?.id ?? null,
      p_limit: filters.limit,
    });
    check(error);
    return data;
  },
  async resolveIdentifier(actor, code, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_resolve_identifier",
      { p_workspace_id: actor.workspaceId, p_code: code },
    );
    check(error);
    return data;
  },
  async listLocations(actor, token) {
    const { data, error } = await userClient(token).rpc("ops_list_locations", {
      p_workspace_id: actor.workspaceId,
    });
    check(error);
    return data;
  },
};
