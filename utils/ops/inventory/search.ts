import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor } from "../../../src/ops/contracts/core";
import { inventorySearchSchema } from "../../../src/ops/contracts/locations";
import { check, userClient } from "./intake";

type Filters = z.infer<typeof inventorySearchSchema>;
type InventoryPage = {
  items: Array<{ id: string; thumbnailUrl?: string }>;
  nextCursor: { createdAt: string; id: string } | null;
};
function mediaClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS media service is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
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
    const page = data as InventoryPage;
    if (!page?.items?.length) return data;
    const client = mediaClient();
    const paths = new Map<string, string>();
    const itemIds = page.items.map((item) => item.id);
    for (
      let offset = 0;
      offset < 2000 && paths.size < itemIds.length;
      offset += 1000
    ) {
      const { data: media, error: mediaError } = await client
        .from("ops_media_assets")
        .select("item_id,derivative_path,position")
        .eq("workspace_id", actor.workspaceId)
        .eq("state", "available")
        .in("item_id", itemIds)
        .order("item_id")
        .order("position")
        .range(offset, offset + 999);
      check(mediaError);
      for (const asset of media ?? [])
        if (asset.derivative_path && !paths.has(asset.item_id))
          paths.set(asset.item_id, asset.derivative_path);
      if (!media || media.length < 1000) break;
    }
    if (!paths.size) return page;
    const selected = [...paths.values()];
    const { data: signed, error: signError } = await client.storage
      .from("ops-derivatives")
      .createSignedUrls(selected, 300);
    check(signError);
    const urls = new Map(
      (signed ?? [])
        .filter((entry) => entry.signedUrl)
        .map((entry) => [entry.path, entry.signedUrl]),
    );
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        thumbnailUrl: urls.get(paths.get(item.id) ?? ""),
      })),
    };
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
