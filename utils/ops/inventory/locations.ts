import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  createLocationSchema,
  locationDeleteSchema,
  locationParentSchema,
  moveItemSchema,
} from "../../../src/ops/contracts/locations";
import { check, userClient } from "./intake";
import { moveItem } from "./movements";

type Create = z.infer<typeof createLocationSchema>;
type Parent = z.infer<typeof locationParentSchema>;
type Delete = z.infer<typeof locationDeleteSchema>;
type Move = z.infer<typeof moveItemSchema>;
export type LocationServices = {
  createLocation(
    actor: Actor,
    input: Create,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  setParent(
    actor: Actor,
    input: Parent,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  deleteLocation(
    actor: Actor,
    input: Delete,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  moveItem(
    actor: Actor,
    input: Move,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
};
export const defaultLocationServices: LocationServices = {
  async createLocation(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_create_location", {
      p_workspace_id: actor.workspaceId,
      p_parent_id: input.parentId ?? null,
      p_code: input.code,
      p_name: input.name,
      p_key: meta.idempotencyKey,
    });
    check(error);
    return data;
  },
  async setParent(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_set_location_parent",
      {
        p_workspace_id: actor.workspaceId,
        p_location_id: input.locationId,
        p_parent_id: input.parentId,
        p_key: meta.idempotencyKey,
        p_expected_version: meta.expectedVersion,
      },
    );
    check(error);
    return data;
  },
  async deleteLocation(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_delete_location", {
      p_workspace_id: actor.workspaceId,
      p_location_id: input.locationId,
      p_key: meta.idempotencyKey,
      p_expected_version: meta.expectedVersion,
    });
    check(error);
    return data;
  },
  moveItem,
};
