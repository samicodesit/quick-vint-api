import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { assertLocalSeedTarget } from "./ops-seed.mjs";
import { runWorker } from "../utils/ops/jobs/worker.ts";

const environment = process.env.OPS_ENV ?? "";
const databaseUrl = process.env.OPS_DATABASE_URL ?? "";
assertLocalSeedTarget(databaseUrl, environment);
const psqlExecutable = process.env.OPS_TEST_PSQL ?? "psql";
const target = new URL(databaseUrl);

function sql(statement) {
  return execFileSync(
    psqlExecutable,
    [
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      target.hostname,
      "-p",
      target.port,
      "-U",
      target.username,
      "-d",
      target.pathname.slice(1),
    ],
    {
      input: statement,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    },
  ).trim();
}

function quote(value) {
  return String(value).replaceAll("'", "''");
}
const repository = {
  async claimJobs(workerId, limit) {
    const output = sql(
      `BEGIN; SET LOCAL ROLE service_role; SELECT row_to_json(job) FROM ops_claim_jobs('${quote(workerId)}',${limit},300) job; COMMIT;`,
    );
    return output
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("{"))
      .map((line) => {
        const row = JSON.parse(line);
        return {
          id: row.id,
          workspaceId: row.workspace_id,
          requestedBy: row.requested_by,
          kind: row.kind,
          payload: row.payload,
          attempts: row.attempts,
        };
      });
  },
  async isAuthorized(job) {
    return sql(
      `SELECT EXISTS(SELECT 1 FROM ops_memberships WHERE workspace_id='${quote(job.workspaceId)}' AND user_id='${quote(job.requestedBy)}' AND active);`,
    ).includes("t");
  },
  async finishJob(id, workerId, result) {
    sql(
      `BEGIN; SET LOCAL ROLE service_role; SELECT ops_finish_job('${quote(id)}','${quote(workerId)}','${quote(JSON.stringify(result))}'::jsonb); COMMIT;`,
    );
  },
  async failJob(id, workerId, message) {
    sql(
      `BEGIN; SET LOCAL ROLE service_role; SELECT ops_fail_job('${quote(id)}','${quote(workerId)}','${quote(message)}'); COMMIT;`,
    );
  },
};

try {
  const metrics = await runWorker({
    deadlineMs: 20_000,
    maxJobs: 10,
    workerId: `local-${randomUUID()}`,
    environment,
    repository,
  });
  const queue = sql(
    "BEGIN; SET LOCAL ROLE service_role; SELECT ops_job_metrics(); COMMIT;",
  )
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("{"));
  console.log(
    JSON.stringify({ ...metrics, queue: queue ? JSON.parse(queue) : null }),
  );
} catch {
  console.error(
    "Local worker failed; inspect the isolated test database configuration.",
  );
  process.exitCode = 1;
}
