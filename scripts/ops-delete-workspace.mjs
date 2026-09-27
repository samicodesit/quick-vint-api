import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const value = (flag) => { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1]; };
const workspaceId = value("--workspace"), requestId = value("--request"), execute = args.includes("--execute");
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
if (!workspaceId || !uuid.test(workspaceId) || !requestId || !uuid.test(requestId)) throw new Error("Pass --workspace and --request UUIDs");
if (execute && value("--confirm") !== workspaceId) throw new Error("--execute also requires --confirm with the exact workspace UUID");
const url = process.env.VERCEL_APP_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const client = createClient(url, key, { auth: { persistSession: false } });
const { data: request, error: requestError } = await client.from("ops_workspace_deletion_requests").select("id,status").eq("id", requestId).eq("workspace_id", workspaceId).maybeSingle();
if (requestError) throw requestError;
if (!request || request.status !== "approved") throw new Error("A separately reviewed and approved deletion request is required");
async function list(offset = 0) { const { data, error } = await client.rpc("ops_list_workspace_storage", { p_workspace_id: workspaceId, p_offset: offset }); if (error) throw error; return data ?? []; }
if (!execute) {
  let offset = 0, count = 0;
  for (;;) { const page = await list(offset); count += page.length; if (page.length < 500) break; offset += 500; }
  process.stdout.write(JSON.stringify({ workspaceId, requestId, mode: "dry_run", privateObjects: count, recordsDeleted: false }) + "\n");
  process.exit(0);
}
let removed = 0;
for (let batch = 0; batch < 2000; batch++) {
  const page = await list();
  if (page.length === 0) break;
  for (const bucket of ["ops-originals", "ops-derivatives", "ops-labels"]) {
    const paths = page.filter((entry) => entry.bucket === bucket && entry.path.startsWith(`${workspaceId}/`)).map((entry) => entry.path);
    if (!paths.length) continue;
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error) throw error;
    removed += paths.length;
  }
  if (batch === 1999) throw new Error("Storage cleanup batch limit reached");
}
if ((await list()).length !== 0) throw new Error("Private storage still contains workspace objects");
const { data, error } = await client.rpc("ops_execute_workspace_deletion", { p_workspace_id: workspaceId, p_request_id: requestId });
if (error) throw error;
process.stdout.write(JSON.stringify({ workspaceId, requestId, removedPrivateObjects: removed, result: data }) + "\n");
