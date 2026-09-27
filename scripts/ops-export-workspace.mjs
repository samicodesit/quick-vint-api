import { createClient } from "@supabase/supabase-js";
import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2), value = (flag) => { const at = args.indexOf(flag); return at < 0 ? null : args[at + 1]; };
const workspaceId = value("--workspace"), output = value("--out");
if (!workspaceId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workspaceId) || !output) throw new Error("Pass --workspace UUID and --out new local directory");
const directory = path.resolve(output);
try { await stat(directory); throw new Error("Export directory already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const url = process.env.VERCEL_APP_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const client = createClient(url, key, { auth: { persistSession: false } });
const { data: workspace, error: workspaceError } = await client.from("ops_workspaces").select("id").eq("id", workspaceId).maybeSingle();
if (workspaceError) throw workspaceError;
if (!workspace) throw new Error("Workspace not found");
await mkdir(directory);
await mkdir(path.join(directory, "tables"));
const { data: tables, error: namesError } = await client.rpc("ops_export_table_names");
if (namesError) throw namesError;
const counts = {};
for (const table of tables) {
  const stream = createWriteStream(path.join(directory, "tables", `${table}.json`), { encoding: "utf8" });
  stream.write("[\n"); let offset = 0, count = 0;
  for (;;) {
    const { data: rows, error } = await client.rpc("ops_export_workspace_table", { p_workspace_id: workspaceId, p_table: table, p_offset: offset });
    if (error) throw error;
    for (const row of rows ?? []) { if (count++) stream.write(",\n"); stream.write(JSON.stringify(row)); }
    if (!rows || rows.length < 500) break;
    offset += 500;
  }
  stream.end("\n]\n");
  await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
  counts[table] = count;
}
const media = [];
for (let offset = 0; ; offset += 500) {
  const { data: rows, error } = await client.rpc("ops_list_workspace_storage", { p_workspace_id: workspaceId, p_offset: offset });
  if (error) throw error;
  media.push(...(rows ?? []));
  if (!rows || rows.length < 500) break;
}
for (const entry of media) {
  if (!["ops-originals", "ops-derivatives", "ops-labels"].includes(entry.bucket) || !entry.path.startsWith(`${workspaceId}/`) || entry.path.split("/").includes("..")) throw new Error("Unexpected private media path");
  const target = path.join(directory, "media", entry.bucket, entry.path);
  await mkdir(path.dirname(target), { recursive: true });
  const { data, error } = await client.storage.from(entry.bucket).download(entry.path);
  if (error || !data) throw error ?? new Error("Media download missing");
  await writeFile(target, Buffer.from(await data.arrayBuffer()), { flag: "wx" });
}
await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ workspaceId, exportedAt: new Date().toISOString(), tableCounts: counts, privateMediaCount: media.length }, null, 2));
process.stdout.write(JSON.stringify({ workspaceId, output: directory, tableCounts: counts, privateMediaCount: media.length }) + "\n");
