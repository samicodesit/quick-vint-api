import { createClient } from "@supabase/supabase-js";
import type { ClaimedJob, JobRepository } from "./worker";

type DatabaseJob = {
  id: string;
  workspace_id: string;
  requested_by: string;
  kind: string;
  payload: unknown;
  attempts: number;
};

export async function queueMetrics() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("ops_job_metrics");
  if (error) throw error;
  return data as {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
  };
}

export function createSupabaseJobRepository(): JobRepository {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  const client = createClient(url, key, { auth: { persistSession: false } });
  return {
    async claimJobs(workerId, limit) {
      const { data, error } = await client.rpc("ops_claim_jobs", {
        p_worker_id: workerId,
        p_limit: limit,
        p_lease_seconds: 300,
      });
      if (error) throw error;
      return ((data ?? []) as DatabaseJob[]).map(
        (job): ClaimedJob => ({
          id: job.id,
          workspaceId: job.workspace_id,
          requestedBy: job.requested_by,
          kind: job.kind,
          payload: job.payload,
          attempts: job.attempts,
        }),
      );
    },
    async isAuthorized(job) {
      const { data, error } = await client
        .from("ops_memberships")
        .select("user_id")
        .eq("workspace_id", job.workspaceId)
        .eq("user_id", job.requestedBy)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async finishJob(id, workerId, result) {
      const { error } = await client.rpc("ops_finish_job", {
        p_id: id,
        p_worker_id: workerId,
        p_result: result,
      });
      if (error) throw error;
    },
    async failJob(id, workerId, message) {
      const { error } = await client.rpc("ops_fail_job", {
        p_id: id,
        p_worker_id: workerId,
        p_error: message,
      });
      if (error) throw error;
    },
  };
}
