import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  handoffAckSchema,
  handoffPacketSchema,
} from "../../../src/ops/contracts/handoff";
import { confirmedFactsSchema } from "../../../src/ops/contracts/listings";
import { OpsError } from "../core/errors";
import { check, userClient } from "../inventory/intake";
import { relevantFacts } from "./templates";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function preparedListingPacket(
  actor: Actor,
  input: z.infer<typeof handoffPacketSchema>,
) {
  const ids = handoffPacketSchema.parse(input);
  const client = serviceClient();
  const [listing, revision, item, facts] = await Promise.all([
    client
      .from("ops_listings")
      .select("id,item_id,status,approved_revision_id")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", ids.listingId)
      .maybeSingle(),
    client
      .from("ops_listing_revisions")
      .select(
        "id,listing_id,item_id,fact_revision,capture_revision,title,description,facts,asset_ids,price_minor,currency,locale,approved_at",
      )
      .eq("workspace_id", actor.workspaceId)
      .eq("id", ids.revisionId)
      .maybeSingle(),
    client
      .from("ops_items")
      .select("id,capture_revision,custody,display_sku")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", ids.itemId)
      .maybeSingle(),
    client
      .from("ops_item_facts")
      .select("revision")
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", ids.itemId)
      .maybeSingle(),
  ]);
  for (const result of [listing, revision, item, facts]) check(result.error);
  const current = listing.data;
  const saved = revision.data;
  const stock = item.data;
  if (
    !current ||
    !saved ||
    !stock ||
    !facts.data ||
    current.item_id !== ids.itemId ||
    current.status !== "ready" ||
    current.approved_revision_id !== ids.revisionId ||
    saved.listing_id !== ids.listingId ||
    saved.item_id !== ids.itemId ||
    !saved.approved_at ||
    saved.fact_revision !== facts.data.revision ||
    saved.capture_revision !== stock.capture_revision ||
    stock.custody !== "on_hand"
  ) {
    throw new OpsError(
      "CONFLICT",
      "Approved listing changed. Review it again.",
    );
  }
  const confirmed = confirmedFactsSchema.parse(saved.facts);
  const { data: assets, error } = await client
    .from("ops_media_assets")
    .select("id,original_path,state")
    .eq("workspace_id", actor.workspaceId)
    .eq("item_id", ids.itemId)
    .in("id", saved.asset_ids);
  check(error);
  if (
    (assets ?? []).length !== saved.asset_ids.length ||
    assets?.some((asset) => asset.state !== "available")
  )
    throw new OpsError(
      "CONFLICT",
      "Approved photos changed. Review the listing again.",
    );
  const photos = await Promise.all(
    saved.asset_ids.map(async (assetId: string) => {
      const asset = assets!.find((row) => row.id === assetId)!;
      const { data, error: signError } = await client.storage
        .from("ops-originals")
        .createSignedUrl(asset.original_path, 300);
      check(signError);
      return { assetId, downloadUrl: data!.signedUrl };
    }),
  );
  return {
    protocolVersion: 1,
    workspaceId: actor.workspaceId,
    itemId: ids.itemId,
    listingId: ids.listingId,
    revisionId: ids.revisionId,
    reference: stock.display_sku,
    title: saved.title,
    description: saved.description,
    facts: relevantFacts(confirmed),
    price: { minor: saved.price_minor, currency: saved.currency },
    locale: saved.locale,
    photos,
    state: "prepared" as const,
    instruction:
      "Review every field and publish in Vinted yourself. A filled form is not a live listing.",
  };
}

export async function acknowledgeHandoff(
  actor: Actor,
  input: z.infer<typeof handoffAckSchema>,
  meta: CommandMeta,
  token: string,
) {
  const checked = handoffAckSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_ack_handoff", {
    p_workspace_id: actor.workspaceId,
    p_item_id: checked.itemId,
    p_listing_id: checked.listingId,
    p_revision_id: checked.revisionId,
    p_request_id: checked.requestId,
    p_state: checked.state,
    p_channel: checked.channel,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
