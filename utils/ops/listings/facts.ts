import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import { confirmFactsSchema } from "../../../src/ops/contracts/listings";
import { saveTemplateSchema } from "../../../src/ops/contracts/listings";
import { check, userClient } from "../inventory/intake";

type ConfirmInput = z.infer<typeof confirmFactsSchema>;

export async function confirmFacts(
  actor: Actor,
  input: ConfirmInput,
  meta: CommandMeta,
  token: string,
) {
  const checked = confirmFactsSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_confirm_facts", {
    p_workspace_id: actor.workspaceId,
    p_item_id: checked.itemId,
    p_expected_revision: checked.factRevision,
    p_values: checked.values,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listingDetail(actor: Actor, itemId: string) {
  const client = serviceClient();
  const [item, facts, listing, media, analysis] = await Promise.all([
    client
      .from("ops_items")
      .select("id,display_sku,capture_revision")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", itemId)
      .maybeSingle(),
    client
      .from("ops_item_facts")
      .select("item_id,revision,values,confirmed_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", itemId)
      .maybeSingle(),
    client
      .from("ops_listings")
      .select(
        "id,item_id,locale,status,version,current_revision_id,approved_revision_id",
      )
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", itemId)
      .maybeSingle(),
    client
      .from("ops_media_assets")
      .select("id,position,state,derivative_path")
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", itemId)
      .eq("state", "available")
      .order("position"),
    client
      .from("ops_analysis_runs")
      .select("id,status,created_at,omitted_count")
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  for (const result of [item, facts, listing, media, analysis])
    check(result.error);
  const runIds = (analysis.data ?? []).map((row) => row.id);
  const [revisions, proposals] = await Promise.all([
    listing.data
      ? client
          .from("ops_listing_revisions")
          .select(
            "id,listing_id,fact_revision,capture_revision,template_version,locale,price_minor,currency,human_description_override,title,description,facts,asset_ids,approved_at,created_at",
          )
          .eq("workspace_id", actor.workspaceId)
          .eq("listing_id", listing.data.id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? client
          .from("ops_analysis_proposals")
          .select(
            "id,run_id,field_name,value_text,value_number,value_unit,reason,label_text,crop,ops_analysis_evidence(asset_id)",
          )
          .eq("workspace_id", actor.workspaceId)
          .in("run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  check(revisions.error);
  check(proposals.error);
  const signedMedia = await Promise.all(
    (media.data ?? []).map(async (asset) => {
      if (!asset.derivative_path) return { ...asset, url: null };
      const { data, error } = await client.storage
        .from("ops-derivatives")
        .createSignedUrl(asset.derivative_path, 60);
      check(error);
      return { ...asset, url: data?.signedUrl ?? null };
    }),
  );
  return {
    item: item.data,
    facts: facts.data,
    listing: listing.data,
    media: signedMedia,
    analysis: analysis.data,
    revisions: revisions.data,
    proposals: proposals.data,
  };
}

export async function readyListings(actor: Actor) {
  const client = serviceClient();
  const { data, error } = await client
    .from("ops_listings")
    .select(
      "id,item_id,status,version,approved_revision_id,updated_at,ops_items(display_sku)",
    )
    .eq("workspace_id", actor.workspaceId)
    .in("status", ["draft", "ready", "failed", "uncertain"])
    .order("updated_at", { ascending: false })
    .limit(50);
  check(error);
  return data ?? [];
}

export async function listingTemplates(actor: Actor) {
  const { data, error } = await serviceClient()
    .from("ops_listing_templates")
    .select("locale,prefix,suffix,version")
    .eq("workspace_id", actor.workspaceId)
    .order("locale");
  check(error);
  return data ?? [];
}

export async function saveTemplate(
  actor: Actor,
  input: z.infer<typeof saveTemplateSchema>,
  meta: CommandMeta,
  token: string,
) {
  const checked = saveTemplateSchema.parse(input);
  const { data, error } = await userClient(token).rpc(
    "ops_save_listing_template",
    {
      p_workspace_id: actor.workspaceId,
      p_locale: checked.locale,
      p_prefix: checked.prefix,
      p_suffix: checked.suffix,
      p_expected_version: checked.expectedVersion,
      p_key: meta.idempotencyKey,
    },
  );
  check(error);
  return data;
}
