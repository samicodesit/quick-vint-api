import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actorSchema, type Actor } from "../../../src/ops/contracts/core";

const inputSchema = z.object({
  kind: z.string().min(1).max(80),
  dedupeKey: z.string().min(1).max(160),
  payload: z.unknown(),
  availableAt: z.string().datetime({ offset: true }),
});
export type EnqueueInput = z.infer<typeof inputSchema>;
type Rpc = (args: Record<string, unknown>) => Promise<string>;

async function defaultRpc(args: Record<string, unknown>) {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("ops_enqueue_job_service", args);
  if (error) throw error;
  return String(data);
}

export async function enqueueJob(
  actor: Actor,
  input: EnqueueInput,
  environment = process.env.OPS_ENV ?? "production",
  rpc: Rpc = defaultRpc,
): Promise<string> {
  actorSchema.parse(actor);
  const validated = inputSchema.parse(input);
  if (
    validated.kind === "fixture.echo" &&
    environment !== "local" &&
    environment !== "test"
  )
    throw new Error(
      "Fixture jobs are disabled outside local/test environments",
    );
  if (validated.kind !== "fixture.echo")
    throw new Error("Unsupported job kind");
  const payloadText = JSON.stringify(validated.payload);
  if (!payloadText || Buffer.byteLength(payloadText) > 65_536)
    throw new Error("Job payload is too large or invalid");
  return rpc({
    p_actor_user_id: actor.userId,
    p_workspace_id: actor.workspaceId,
    p_kind: validated.kind,
    p_dedupe_key: validated.dedupeKey,
    p_payload: validated.payload,
    p_available_at: validated.availableAt,
  });
}
