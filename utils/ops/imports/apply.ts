import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import { importMappingSchema } from "../../../src/ops/contracts/imports";
import { OpsError } from "../core/errors";
import { check, userClient } from "../inventory/intake";
import { parseImportCsv } from "./parse";
import { mapImportRow, markInFileConflicts } from "./map";
import { exportImportRows } from "./export";

type Mapping = z.infer<typeof importMappingSchema>;
function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS Supabase configuration is incomplete");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function stageImport(actor: Actor, name: string, text: string) {
  if (!["owner", "manager"].includes(actor.role))
    throw new OpsError("FORBIDDEN", "Import requires a manager");
  const parsed = parseImportCsv(text);
  const db = serviceClient();
  let { data: file, error } = await db
    .from("ops_import_files")
    .select("id,row_count")
    .eq("workspace_id", actor.workspaceId)
    .eq("sha256", parsed.sha256)
    .maybeSingle();
  check(error);
  const replay = Boolean(file);
  if (!file) {
    const inserted = await db
      .from("ops_import_files")
      .insert({
        workspace_id: actor.workspaceId,
        sha256: parsed.sha256,
        original_name: name.slice(0, 255),
        raw_csv: text,
        headers: parsed.headers,
        row_count: parsed.rows.length,
        uploaded_by: actor.userId,
      })
      .select("id,row_count")
      .single();
    if (inserted.error?.code === "23505") {
      const again = await db
        .from("ops_import_files")
        .select("id,row_count")
        .eq("workspace_id", actor.workspaceId)
        .eq("sha256", parsed.sha256)
        .single();
      check(again.error);
      file = again.data;
    } else {
      check(inserted.error);
      file = inserted.data;
    }
  }
  if (!file) throw new Error("Import file could not be saved");
  for (let offset = 0; offset < parsed.rows.length; offset += 500) {
    const chunk = parsed.rows.slice(offset, offset + 500).map((row, index) => ({
      workspace_id: actor.workspaceId,
      file_id: file!.id,
      row_number: offset + index + 1,
      raw_values: row,
    }));
    const staged = await db.from("ops_import_file_rows").upsert(chunk, {
      onConflict: "file_id,row_number",
      ignoreDuplicates: true,
    });
    check(staged.error);
  }
  return {
    fileId: file.id as string,
    rowCount: file.row_count as number,
    headers: parsed.headers,
    replay,
  };
}

async function loadAllRows(importId: string, workspaceId: string) {
  const db = serviceClient();
  const rows: Array<{
    row_number: number;
    status: string;
    reason: string | null;
    item_id: string | null;
    raw_values: Record<string, unknown>;
    mapped_values: Record<string, unknown>;
  }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("ops_import_rows")
      .select("row_number,status,reason,item_id,raw_values,mapped_values")
      .eq("workspace_id", workspaceId)
      .eq("import_id", importId)
      .order("row_number")
      .range(offset, offset + 999);
    check(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function previewImport(
  actor: Actor,
  fileId: string,
  mapping: Mapping,
  token: string,
) {
  if (!["owner", "manager"].includes(actor.role))
    throw new OpsError("FORBIDDEN", "Import requires a manager");
  const db = serviceClient();
  const { data: file, error } = await db
    .from("ops_import_files")
    .select("id,raw_csv,headers,row_count")
    .eq("workspace_id", actor.workspaceId)
    .eq("id", fileId)
    .maybeSingle();
  check(error);
  if (!file) throw new OpsError("NOT_FOUND", "CSV file not found");
  const headers = file.headers as string[];
  for (const selected of Object.values(mapping.columns))
    if (selected && !headers.includes(selected))
      throw new OpsError("VALIDATION", `Column ${selected} is not in the CSV`);
  const parsed = parseImportCsv(file.raw_csv);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        accountScope: mapping.accountScope,
        columns: Object.fromEntries(
          Object.entries(mapping.columns).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        ),
      }),
    )
    .digest("hex");
  let { data: run, error: runError } = await db
    .from("ops_import_runs")
    .select("id,status")
    .eq("workspace_id", actor.workspaceId)
    .eq("file_id", fileId)
    .eq("mapping_hash", hash)
    .maybeSingle();
  check(runError);
  if (!run) {
    const inserted = await db
      .from("ops_import_runs")
      .insert({
        workspace_id: actor.workspaceId,
        file_id: fileId,
        mapping,
        mapping_hash: hash,
        account_scope: mapping.accountScope,
        created_by: actor.userId,
      })
      .select("id,status")
      .single();
    if (inserted.error?.code === "23505") {
      const again = await db
        .from("ops_import_runs")
        .select("id,status")
        .eq("workspace_id", actor.workspaceId)
        .eq("file_id", fileId)
        .eq("mapping_hash", hash)
        .single();
      check(again.error);
      run = again.data;
    } else {
      check(inserted.error);
      run = inserted.data;
    }
  }
  if (!run) throw new Error("Import preview could not be saved");
  const mapped = markInFileConflicts(
    parsed.rows.map((raw) => mapImportRow(raw, mapping)),
  );
  for (let offset = 0; offset < mapped.length; offset += 500) {
    const chunk = mapped.slice(offset, offset + 500).map((row, index) => ({
      workspace_id: actor.workspaceId,
      import_id: run!.id,
      row_number: offset + index + 1,
      raw_values: parsed.rows[offset + index],
      mapped_values: row.mapped,
      status: row.status,
      reason: row.reason,
    }));
    const staged = await db.from("ops_import_rows").upsert(chunk, {
      onConflict: "import_id,row_number",
      ignoreDuplicates: true,
    });
    check(staged.error);
  }
  const inspected = await userClient(token).rpc("ops_preview_import_matches", {
    p_workspace_id: actor.workspaceId,
    p_import_id: run.id,
  });
  check(inspected.error);
  const rows = await loadAllRows(run.id, actor.workspaceId);
  return {
    importId: run.id,
    fileId,
    status: run.status,
    rowCount: rows.length,
    sample: rows.slice(0, 5),
    counts: counts(rows),
  };
}

function counts(rows: Array<{ status: string }>) {
  return rows.reduce<Record<string, number>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
}

export type ImportServices = {
  previewImport(
    actor: Actor,
    fileId: string,
    mapping: Mapping,
    token: string,
  ): Promise<unknown>;
  applyImport(
    actor: Actor,
    importId: string,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  exportImportResults(actor: Actor, importId: string): Promise<string>;
  detail(actor: Actor, importId: string): Promise<unknown>;
};
export const defaultImportServices: ImportServices = {
  previewImport,
  async applyImport(actor, importId, meta, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_apply_import_batch",
      {
        p_workspace_id: actor.workspaceId,
        p_import_id: importId,
        p_key: meta.idempotencyKey,
        p_limit: 100,
      },
    );
    check(error);
    return data;
  },
  async exportImportResults(actor, importId) {
    const { data: run, error } = await serviceClient()
      .from("ops_import_runs")
      .select("id")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", importId)
      .maybeSingle();
    check(error);
    if (!run) throw new OpsError("NOT_FOUND", "Import not found");
    return exportImportRows(await loadAllRows(importId, actor.workspaceId));
  },
  async detail(actor, importId) {
    const { data: run, error } = await serviceClient()
      .from("ops_import_runs")
      .select("id,file_id,status,mapping,created_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", importId)
      .maybeSingle();
    check(error);
    if (!run) throw new OpsError("NOT_FOUND", "Import not found");
    const rows = await loadAllRows(importId, actor.workspaceId);
    return {
      importId,
      status: run.status,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
      counts: counts(rows),
    };
  },
};
