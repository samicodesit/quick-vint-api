import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import { moveItemSchema } from "../../../src/ops/contracts/locations";
import { check, userClient } from "./intake";

export async function moveItem(
  actor: Actor,
  input: z.infer<typeof moveItemSchema>,
  meta: CommandMeta,
  token: string,
) {
  const { data, error } = await userClient(token).rpc("ops_move_item", {
    p_workspace_id: actor.workspaceId,
    p_item_id: input.itemId,
    p_location_id: input.locationId,
    p_key: meta.idempotencyKey,
    p_expected_version: meta.expectedVersion,
  });
  check(error);
  return data;
}
