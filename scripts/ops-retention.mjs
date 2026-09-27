import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2), index = args.indexOf("--workspace"), workspaceId = index < 0 ? null : args[index + 1], execute = args.includes("--execute");
if (!workspaceId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workspaceId)) throw new Error("Pass --workspace UUID");
if (execute && args[args.indexOf("--confirm") + 1] !== workspaceId) throw new Error("--execute requires --confirm with the exact workspace UUID");
const url = process.env.VERCEL_APP_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const client = createClient(url, key, { auth: { persistSession: false } });
async function candidates() { const { data, error } = await client.rpc("ops_retention_candidates", { p_workspace_id: workspaceId, p_limit: 500 }); if (error) throw error; return data ?? []; }
if (!execute) { const page = await candidates(); process.stdout.write(JSON.stringify({ workspaceId, mode: "dry_run", firstBatchEligible: page.length, objectsDeleted: false }) + "\n"); process.exit(0); }
let purged = 0;
for (let batch = 0; batch < 2000; batch++) {
  const page = await candidates();
  if (!page.length) break;
  for (const asset of page) {
    const entries = [["ops-originals", asset.originalPath], ["ops-derivatives", asset.derivativePath]];
    for (const [bucket, path] of entries) {
      if (!path) continue;
      if (!path.startsWith(`${workspaceId}/`)) throw new Error("Media path escaped workspace prefix");
      const { error } = await client.storage.from(bucket).remove([path]);
      if (error) throw error;
    }
    const { error } = await client.rpc("ops_mark_media_purged", { p_workspace_id: workspaceId, p_asset_id: asset.assetId });
    if (error) throw error;
    purged++;
  }
  if (batch === 1999) throw new Error("Retention batch limit reached");
}
process.stdout.write(JSON.stringify({ workspaceId, purgedAssets: purged }) + "\n");
