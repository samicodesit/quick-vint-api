import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  credentialDeleteSchema,
  credentialStoreSchema,
  inviteAcceptSchema,
  inviteCreateSchema,
  inviteRevokeSchema,
  memberUpdateSchema,
  settingsUpdateSchema,
  exportPageSchema,
} from "../../../src/ops/contracts/admin";
import { check, userClient } from "../inventory/intake";
import { sendInvitationEmail } from "./invite-mail";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
function owner(actor: Actor) {
  if (actor.role !== "owner")
    throw Object.assign(new Error("Owner access required"), {
      opsCode: "FORBIDDEN",
    });
}
function keyBytes() {
  const key = Buffer.from(process.env.OPS_CREDENTIAL_KEY ?? "", "base64");
  if (key.length !== 32)
    throw new Error("OPS_CREDENTIAL_KEY must be a 32-byte base64 key");
  return key;
}
export function encryptCredential(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    body.toString("base64"),
  ].join(":");
}
export function decryptCredential(value: string) {
  const [version, iv, tag, body] = value.split(":");
  if (version !== "v1") throw new Error("Unsupported credential version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function createInvite(
  actor: Actor,
  input: z.infer<typeof inviteCreateSchema>,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const value = inviteCreateSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_invite_create", {
    p_workspace_id: actor.workspaceId,
    p_email: value.email,
    p_role: value.role,
    p_key: meta.idempotencyKey,
  });
  check(error);
  if (process.env.OPS_INVITE_MAIL_ENABLED === "1") {
    const base = process.env.OPS_PUBLIC_BASE_URL;
    if (!base) throw new Error("Invitation public URL is not configured");
    const { data: workspace, error: workspaceError } = await serviceClient()
      .from("ops_workspaces")
      .select("name")
      .eq("id", actor.workspaceId)
      .single();
    check(workspaceError);
    await sendInvitationEmail(
      value.email,
      workspace!.name,
      `${base.replace(/\/$/, "")}/app/invite?token=${data.token}`,
    );
  }
  return { ...data, emailSent: process.env.OPS_INVITE_MAIL_ENABLED === "1" };
}
export async function acceptInvite(
  actor: Actor,
  input: z.infer<typeof inviteAcceptSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = inviteAcceptSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_invite_accept", {
    p_token: value.token,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function revokeInvite(
  actor: Actor,
  input: z.infer<typeof inviteRevokeSchema>,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const value = inviteRevokeSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_invite_revoke", {
    p_workspace_id: actor.workspaceId,
    p_invite_id: value.inviteId,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function updateMember(
  actor: Actor,
  input: z.infer<typeof memberUpdateSchema>,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const value = memberUpdateSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_member_update", {
    p_workspace_id: actor.workspaceId,
    p_target_user_id: value.userId,
    p_role: value.role,
    p_active: value.active,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function updateSettings(
  actor: Actor,
  input: z.infer<typeof settingsUpdateSchema>,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const value = settingsUpdateSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_settings_update", {
    p_workspace_id: actor.workspaceId,
    p_budget_minor: value.aiMonthlyBudgetMinor,
    p_currency: value.aiCurrency,
    p_retention_days: value.mediaRetentionDays,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function requestDeletion(
  actor: Actor,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const { data, error } = await userClient(token).rpc(
    "ops_request_workspace_deletion",
    { p_workspace_id: actor.workspaceId, p_key: meta.idempotencyKey },
  );
  check(error);
  return data;
}
export async function adminOverview(actor: Actor) {
  owner(actor);
  const client = serviceClient();
  const [
    members,
    invitations,
    settings,
    credentials,
    deletion,
    jobs,
    problems,
    connections,
  ] = await Promise.all([
    client
      .from("ops_memberships")
      .select("user_id,role,active,created_at")
      .eq("workspace_id", actor.workspaceId),
    client
      .from("ops_invitations")
      .select("id,email,role,created_at,expires_at,accepted_at,revoked_at")
      .eq("workspace_id", actor.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("ops_workspace_settings")
      .select(
        "ai_monthly_budget_minor,ai_currency,media_retention_days,version",
      )
      .eq("workspace_id", actor.workspaceId)
      .maybeSingle(),
    client
      .from("ops_credentials")
      .select("provider,last_verified_at,updated_at,key_version")
      .eq("workspace_id", actor.workspaceId),
    client
      .from("ops_workspace_deletion_requests")
      .select("id,status,requested_at")
      .eq("workspace_id", actor.workspaceId)
      .order("requested_at", { ascending: false })
      .limit(10),
    client
      .from("ops_jobs")
      .select("id,kind,status,attempts,last_error,updated_at")
      .eq("workspace_id", actor.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(25),
    client
      .from("ops_exceptions")
      .select("id,source_kind,message,created_at,resolved_at")
      .eq("workspace_id", actor.workspaceId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("ops_vinted_connections")
      .select(
        "id,environment,verified_at,last_reconciled_at,read_items_verified,read_orders_verified,labels_verified,publish_verified",
      )
      .eq("workspace_id", actor.workspaceId),
  ]);
  for (const result of [
    members,
    invitations,
    settings,
    credentials,
    deletion,
    jobs,
    problems,
    connections,
  ])
    check(result.error);
  return {
    members: members.data ?? [],
    invitations: invitations.data ?? [],
    settings: settings.data ?? {
      ai_monthly_budget_minor: 0,
      ai_currency: "EUR",
      media_retention_days: 365,
      version: 0,
    },
    credentials: credentials.data ?? [],
    deletionRequests: deletion.data ?? [],
    jobs: jobs.data ?? [],
    problems: problems.data ?? [],
    connections: connections.data ?? [],
  };
}
export async function storeCredential(
  actor: Actor,
  input: z.infer<typeof credentialStoreSchema>,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const value = credentialStoreSchema.parse(input);
  const encrypted = encryptCredential(value.secret);
  const { data, error } = await userClient(token).rpc("ops_store_credential", {
    p_workspace_id: actor.workspaceId,
    p_provider: value.provider,
    p_ciphertext: encrypted,
    p_key_version: 1,
    p_secret_hash: createHash("sha256").update(value.secret).digest("hex"),
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function deleteCredential(
  actor: Actor,
  input: z.infer<typeof credentialDeleteSchema>,
  meta: CommandMeta,
  token: string,
) {
  owner(actor);
  const value = credentialDeleteSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_delete_credential", {
    p_workspace_id: actor.workspaceId,
    p_provider: value.provider,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}

export const exportTables = [
  "ops_workspaces",
  "ops_memberships",
  "ops_bootstrap_requests",
  "ops_audit_events",
  "ops_command_results",
  "ops_suppliers",
  "ops_lots",
  "ops_items",
  "ops_item_identifiers",
  "ops_cost_corrections",
  "ops_locations",
  "ops_item_movements",
  "ops_capture_sessions",
  "ops_media_assets",
  "ops_capture_pairings",
  "ops_media_quotas",
  "ops_import_files",
  "ops_import_file_rows",
  "ops_import_runs",
  "ops_import_rows",
  "ops_import_external_links",
  "ops_item_field_provenance",
  "ops_jobs",
  "ops_job_events",
  "ops_exceptions",
  "ops_ai_entitlements",
  "ops_analysis_runs",
  "ops_analysis_run_assets",
  "ops_analysis_dispatches",
  "ops_analysis_proposals",
  "ops_analysis_evidence",
  "ops_usage_entries",
  "ops_item_facts",
  "ops_listing_templates",
  "ops_listings",
  "ops_listing_revisions",
  "ops_handoff_events",
  "ops_vinted_connections",
  "ops_vinted_events",
  "ops_vinted_publications",
  "ops_orders",
  "ops_order_lines",
  "ops_reservations",
  "ops_order_issues",
  "ops_pick_waves",
  "ops_pick_tasks",
  "ops_pack_sessions",
  "ops_pack_scans",
  "ops_labels",
  "ops_shipments",
  "ops_returns",
  "ops_return_lines",
  "ops_refund_observations",
  "ops_stocktakes",
  "ops_stocktake_expected",
  "ops_stocktake_observations",
  "ops_stocktake_resolutions",
  "ops_financial_entries",
  "ops_invitations",
  "ops_workspace_settings",
  "ops_workspace_deletion_requests",
  "ops_credentials",
  "ops_deletion_tombstones",
] as const;
export const exportOrder: Record<string, string[]> = {
  ops_memberships: ["user_id"],
  ops_bootstrap_requests: ["idempotency_key"],
  ops_command_results: ["idempotency_key"],
  ops_media_quotas: ["workspace_id"],
  ops_ai_entitlements: ["workspace_id"],
  ops_import_file_rows: ["file_id", "row_number"],
  ops_import_external_links: ["account_scope", "external_id"],
  ops_item_field_provenance: ["item_id", "field_name"],
  ops_analysis_run_assets: ["run_id", "asset_id"],
  ops_analysis_evidence: ["proposal_id", "asset_id"],
  ops_item_facts: ["item_id"],
  ops_listing_templates: ["locale"],
  ops_stocktake_expected: ["stocktake_id", "item_id"],
  ops_stocktake_observations: ["stocktake_id", "item_id"],
  ops_workspace_settings: ["workspace_id"],
  ops_deletion_tombstones: ["workspace_id"],
};
export async function exportWorkspacePage(
  actor: Actor,
  input: z.infer<typeof exportPageSchema>,
) {
  owner(actor);
  const value = exportPageSchema.parse(input);
  if (!exportTables.includes(value.table as (typeof exportTables)[number]))
    throw new Error("Export table not allowed");
  const key = value.table === "ops_workspaces" ? "id" : "workspace_id";
  let query = serviceClient()
    .from(value.table)
    .select("*")
    .eq(key, actor.workspaceId);
  for (const column of exportOrder[value.table] ?? ["id"])
    query = query.order(column);
  const { data, error } = await query.range(value.offset, value.offset + 499);
  check(error);
  const rows = (data ?? []).map((row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([name]) =>
          name !== "token_hash" &&
          name !== "ciphertext" &&
          (value.table !== "ops_command_results" || name !== "result"),
      ),
    ),
  );
  return {
    table: value.table,
    offset: value.offset,
    rows,
    nextOffset: rows.length === 500 ? value.offset + 500 : null,
  };
}
