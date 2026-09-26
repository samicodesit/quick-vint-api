import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  approveListingSchema,
  confirmedFactsSchema,
  saveListingSchema,
} from "../../../src/ops/contracts/listings";
import { OpsError } from "../core/errors";
import { check, userClient } from "../inventory/intake";
import { listingIssues, renderListing } from "./render";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function saveListing(
  actor: Actor,
  input: z.infer<typeof saveListingSchema>,
  meta: CommandMeta,
) {
  const checked = saveListingSchema.parse(input);
  const client = serviceClient();
  const [factsResult, templateResult] = await Promise.all([
    client
      .from("ops_item_facts")
      .select("revision,values")
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", checked.itemId)
      .maybeSingle(),
    client
      .from("ops_listing_templates")
      .select("prefix,suffix,version")
      .eq("workspace_id", actor.workspaceId)
      .eq("locale", checked.locale)
      .maybeSingle(),
  ]);
  check(factsResult.error);
  check(templateResult.error);
  if (
    !factsResult.data ||
    factsResult.data.revision !== checked.expectedFactRevision
  )
    throw new OpsError("CONFLICT", "Confirmed facts changed");
  const facts = confirmedFactsSchema.parse(factsResult.data.values);
  const rendered = renderListing(
    facts,
    {
      locale: checked.locale,
      prefix: templateResult.data?.prefix ?? "",
      suffix: templateResult.data?.suffix ?? "",
    },
    checked.humanDescriptionOverride,
  );
  const issues = listingIssues({
    facts,
    ...rendered,
    priceMinor: checked.priceMinor,
    currency: checked.currency,
  });
  if (issues.length) throw new OpsError("VALIDATION", issues[0]);
  const { data, error } = await client.rpc("ops_save_listing_draft_service", {
    p_workspace_id: actor.workspaceId,
    p_actor_user_id: actor.userId,
    p_item_id: checked.itemId,
    p_expected_fact_revision: checked.expectedFactRevision,
    p_expected_listing_version: checked.expectedListingVersion,
    p_expected_template_version: templateResult.data?.version ?? 1,
    p_locale: checked.locale,
    p_price_minor: checked.priceMinor,
    p_currency: checked.currency,
    p_human_override: checked.humanDescriptionOverride,
    p_title: rendered.title,
    p_description: rendered.description,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return { ...data, ...rendered };
}

export async function approveListing(
  actor: Actor,
  input: z.infer<typeof approveListingSchema>,
  meta: CommandMeta,
  token: string,
) {
  const checked = approveListingSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_approve_listing", {
    p_workspace_id: actor.workspaceId,
    p_listing_id: checked.listingId,
    p_revision_id: checked.revisionId,
    p_expected_listing_version: checked.expectedListingVersion,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
