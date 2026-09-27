import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  claimPickTaskSchema,
  createPickWaveSchema,
  missingPickSchema,
  pickWaveDetailSchema,
  verifyPickSchema,
} from "../../../src/ops/contracts/pick";
import { check, userClient } from "../inventory/intake";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function createPickWave(
  actor: Actor,
  input: z.infer<typeof createPickWaveSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = createPickWaveSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_create_pick_wave", {
    p_workspace_id: actor.workspaceId,
    p_orders: value.orders,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function claimPickTask(
  actor: Actor,
  input: z.infer<typeof claimPickTaskSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = claimPickTaskSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_claim_pick_task", {
    p_workspace_id: actor.workspaceId,
    p_task_id: value.taskId,
    p_expected_version: meta.expectedVersion,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function verifyPick(
  actor: Actor,
  input: z.infer<typeof verifyPickSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = verifyPickSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_verify_pick", {
    p_workspace_id: actor.workspaceId,
    p_task_id: value.taskId,
    p_claim_id: value.claimId,
    p_item_code: value.itemCode,
    p_tote_code: value.toteCode,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function markPickMissing(
  actor: Actor,
  input: z.infer<typeof missingPickSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = missingPickSchema.parse(input);
  const { data, error } = await userClient(token).rpc("ops_mark_pick_missing", {
    p_workspace_id: actor.workspaceId,
    p_task_id: value.taskId,
    p_claim_id: value.claimId,
    p_reason: value.reason,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}
export async function listPickWaves(actor: Actor) {
  const { data, error } = await serviceClient()
    .from("ops_pick_waves")
    .select("id,mode,status,created_at,created_by")
    .eq("workspace_id", actor.workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  check(error);
  return data ?? [];
}
export async function pickWaveDetail(
  actor: Actor,
  input: z.infer<typeof pickWaveDetailSchema>,
) {
  const value = pickWaveDetailSchema.parse(input),
    client = serviceClient();
  const [wave, tasks] = await Promise.all([
    client
      .from("ops_pick_waves")
      .select("id,mode,status,created_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", value.waveId)
      .maybeSingle(),
    client
      .from("ops_pick_tasks")
      .select(
        "id,order_id,item_id,expected_location_id,tote_code,status,claim_id,claimed_by,claim_until,version,ops_items(display_sku),ops_locations(code,numeric_order)",
      )
      .eq("workspace_id", actor.workspaceId)
      .eq("wave_id", value.waveId),
  ]);
  check(wave.error);
  check(tasks.error);
  if (!wave.data)
    throw Object.assign(new Error("Pick wave not found"), {
      opsCode: "NOT_FOUND",
    });
  const sorted = (tasks.data ?? []).sort((a, b) => {
    const al = a.ops_locations as unknown as {
      numeric_order: number | null;
      code: string;
    } | null;
    const bl = b.ops_locations as unknown as {
      numeric_order: number | null;
      code: string;
    } | null;
    if (al?.numeric_order != null && bl?.numeric_order != null)
      return al.numeric_order - bl.numeric_order;
    if (al?.numeric_order != null) return -1;
    if (bl?.numeric_order != null) return 1;
    return (al?.code ?? "").localeCompare(bl?.code ?? "");
  });
  return {
    wave: wave.data,
    tasks: sorted.map((task) => ({
      ...task,
      claim_id:
        task.claimed_by === actor.userId &&
        task.claim_until &&
        new Date(task.claim_until).getTime() > Date.now()
          ? task.claim_id
          : null,
    })),
  };
}
