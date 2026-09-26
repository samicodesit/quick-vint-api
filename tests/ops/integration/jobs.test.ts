import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
  sqlAsync,
} from "./psql";

let database: string;
const userId = "a0000000-0000-4000-8000-000000000001";
let workspaceId: string;

beforeAll(() => {
  database = createTestDatabase();
  applyMigration(database, "migrations/2026-09-26_ops_core.sql");
  applyMigration(database, "migrations/2026-09-26_ops_jobs.sql");
  workspaceId = sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; SELECT ops_bootstrap_workspace('Jobs', 'c0000000-0000-4000-8000-000000000011'); COMMIT;`,
    database,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("T02 durable jobs", () => {
  it("service enqueue rechecks the actor's live membership", () => {
    const key = "service-job";
    const command = () =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_enqueue_job_service('${userId}', '${workspaceId}', 'fixture.echo', '${key}', '{"value":3}'::jsonb, now()); COMMIT;`,
        database,
      );
    expect(command()).toMatch(/[a-f0-9]{8}-/);
    sql(
      `UPDATE ops_memberships SET active=false WHERE workspace_id='${workspaceId}' AND user_id='${userId}';`,
      database,
    );
    expect(() => command()).toThrow();
    sql(
      `UPDATE ops_memberships SET active=true WHERE workspace_id='${workspaceId}' AND user_id='${userId}';`,
      database,
    );
  });
  it("deduplicates committed enqueue and rejects changed payload", () => {
    const query = (payload: string) =>
      sql(
        `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; SELECT ops_enqueue_job('${workspaceId}', 'fixture.echo', 'same', '${payload}'::jsonb, now()); COMMIT;`,
        database,
      ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)?.[0];
    const id = query('{"value":"one"}');
    expect(id).toBeTruthy();
    expect(query('{"value":"one"}')).toBe(id);
    expect(() => query('{"value":"two"}')).toThrow();
    expect(
      sql(`SELECT requested_by FROM ops_jobs WHERE id='${id}';`, database),
    ).toBe(userId);
  });

  it("claims once and recovers an expired lease after a worker crash", () => {
    const claim = (worker: string) =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT id FROM ops_claim_jobs('${worker}', 1, 10); COMMIT;`,
        database,
      );
    const first = claim("worker-a").match(
      /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/,
    )?.[0];
    expect(first).toBeTruthy();
    expect(claim("worker-b")).not.toContain(first);
    sql(
      `UPDATE ops_jobs SET lease_until=now()-interval '1 second' WHERE id='${first}';`,
      database,
    );
    expect(claim("worker-b")).toContain(first);
    expect(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_finish_job('${first}', 'worker-b', '{"ok":true}'::jsonb); COMMIT;`,
        database,
      ),
    ).toContain("t");
    expect(claim("worker-a")).not.toContain(first);
  });

  it("exhausts a finite retry budget and records an exception", () => {
    const id = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; SELECT ops_enqueue_job('${workspaceId}', 'fixture.echo', 'exhaust', '{"value":1}'::jsonb, now()); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    for (let attempt = 0; attempt < 3; attempt++) {
      const claim = sql(
        "BEGIN; SET LOCAL ROLE service_role; SELECT id FROM ops_claim_jobs('worker-x', 1, 10); COMMIT;",
        database,
      );
      expect(claim).toContain(id);
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_fail_job('${id}', 'worker-x', 'test failure'); COMMIT;`,
        database,
      );
      if (attempt < 2)
        sql(
          `UPDATE ops_jobs SET available_at=now() WHERE id='${id}';`,
          database,
        );
    }
    expect(sql(`SELECT status FROM ops_jobs WHERE id='${id}';`, database)).toBe(
      "failed",
    );
    expect(
      sql(
        `SELECT count(*) FROM ops_exceptions WHERE source_id='${id}';`,
        database,
      ),
    ).toBe("1");
  });

  it("local worker completes a persisted job after the enqueue process ends", () => {
    const id = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; SELECT ops_enqueue_job('${workspaceId}', 'fixture.echo', 'worker-smoke', '{"value":"persisted"}'::jsonb, now()); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    execFileSync("node_modules/.bin/tsx", ["scripts/ops-worker.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPS_ENV: "test",
        OPS_DATABASE_URL: `postgresql://postgres@127.0.0.1:${process.env.OPS_TEST_PGPORT}/${database}`,
      },
      timeout: 30_000,
      encoding: "utf8",
    });
    expect(sql(`SELECT status FROM ops_jobs WHERE id='${id}';`, database)).toBe(
      "succeeded",
    );
    expect(
      Number(
        sql(
          `SELECT count(*) FROM ops_job_events WHERE job_id='${id}';`,
          database,
        ),
      ),
    ).toBeGreaterThanOrEqual(2);
    const metrics = sql(
      "BEGIN; SET LOCAL ROLE service_role; SELECT ops_job_metrics(); COMMIT;",
      database,
    );
    expect(metrics).toContain("succeeded");
    expect(metrics).not.toContain("persisted");
  });

  it("lets only one concurrent worker claim the same piece of work", async () => {
    const id = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; SELECT ops_enqueue_job('${workspaceId}', 'fixture.echo', 'race', '{"value":"race"}'::jsonb, now()); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    const [first, second] = await Promise.all([
      sqlAsync(
        "BEGIN; SET LOCAL ROLE service_role; SELECT id FROM ops_claim_jobs('race-a',1,300); COMMIT;",
        database,
      ),
      sqlAsync(
        "BEGIN; SET LOCAL ROLE service_role; SELECT id FROM ops_claim_jobs('race-b',1,300); COMMIT;",
        database,
      ),
    ]);
    expect(Number(first.includes(id)) + Number(second.includes(id))).toBe(1);
  });
});
