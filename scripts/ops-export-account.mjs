import { createClient } from "@supabase/supabase-js";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2), value = (flag) => { const at = args.indexOf(flag); return at < 0 ? null : args[at + 1]; };
const userId = value("--user"), output = value("--out");
if (!userId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId) || !output) throw new Error("Pass --user UUID and --out new local directory");
const directory = path.resolve(output);
try { await stat(directory); throw new Error("Export directory already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const url = process.env.VERCEL_APP_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const client = createClient(url, key, { auth: { persistSession: false } });
await mkdir(directory);
const { data: tables, error: namesError } = await client.rpc("ops_export_table_names");
if (namesError) throw namesError;
const counts = {}, assets = [];
for (const table of tables) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.rpc("ops_export_user_table", { p_user_id: userId, p_table: table, p_offset: offset });
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  if (table === "ops_media_assets") assets.push(...rows);
  counts[table] = rows.length;
  await writeFile(path.join(directory, `${table}.json`), JSON.stringify(rows, null, 2));
}
for (const [table, column] of [["profiles", "id"], ["api_logs", "user_id"], ["rate_limits", "user_id"]]) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select("*").eq(column, userId).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  counts[table] = rows.length;
  await writeFile(path.join(directory, `${table}.json`), JSON.stringify(rows, null, 2));
}
const { data: authUser, error: authError } = await client.auth.admin.getUserById(userId);
if (authError) throw authError;
await writeFile(path.join(directory, "auth-user.json"), JSON.stringify(authUser.user ? { id: authUser.user.id, email: authUser.user.email, created_at: authUser.user.created_at, user_metadata: authUser.user.user_metadata } : null, null, 2));
let mediaCount = 0;
for (const asset of assets) for (const [bucket, mediaPath] of [["ops-originals", asset.original_path], ["ops-derivatives", asset.derivative_path]]) {
  if (!mediaPath) continue;
  if (!mediaPath.startsWith(`${asset.workspace_id}/`) || mediaPath.split("/").includes("..")) throw new Error("Unexpected account media path");
  const { data, error } = await client.storage.from(bucket).download(mediaPath);
  if (error || !data) throw error ?? new Error("Media download missing");
  const target = path.join(directory, "media", bucket, mediaPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await data.arrayBuffer()), { flag: "wx" });
  mediaCount++;
}
await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ userId, exportedAt: new Date().toISOString(), tableCounts: counts, privateMediaCount: mediaCount }, null, 2));
process.stdout.write(JSON.stringify({ userId, output: directory, tableCounts: counts, privateMediaCount: mediaCount }) + "\n");
