import { execFileSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";

const databases: string[] = [];
const user = "a0000000-0000-4000-8000-000000001820";
const uuid = (value: string) =>
  value.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];

afterAll(() => {
  for (const database of databases.reverse()) dropTestDatabase(database);
});

it("restores a committed job and rebuilds the queued work from database data", () => {
  const source = createTestDatabase();
  databases.push(source);
  for (const name of ["core", "jobs"])
    applyMigration(source, `migrations/2026-09-26_ops_${name}.sql`);
  const workspace = uuid(
    sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SELECT ops_bootstrap_workspace('Restore fixture','c0000000-0000-4000-8000-000000001820'); COMMIT;`,
      source,
    ),
  );
  const job = uuid(
    sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SELECT ops_enqueue_job('${workspace}','fixture.echo','backup-fixture','{"value":1}'::jsonb,now()); COMMIT;`,
      source,
    ),
  );
  const psql = process.env.OPS_TEST_PSQL!;
  const pgDump = psql.replace(/psql\.exe$/i, "pg_dump.exe");
  const dump = execFileSync(
    pgDump,
    [
      "--data-only",
      "--schema=public",
      "--no-owner",
      "--no-acl",
      "-h",
      "127.0.0.1",
      "-p",
      process.env.OPS_TEST_PGPORT!,
      "-U",
      "postgres",
      "-d",
      source,
    ],
    { encoding: "utf8", timeout: 10000, windowsHide: true },
  );
  const restored = createTestDatabase();
  databases.push(restored);
  for (const name of ["core", "jobs"])
    applyMigration(restored, `migrations/2026-09-26_ops_${name}.sql`);
  sql(dump, restored);
  expect(
    sql(
      `SELECT count(*) FROM ops_jobs WHERE workspace_id='${workspace}' AND id='${job}' AND status='queued';`,
      restored,
    ),
  ).toBe("1");
  expect(
    uuid(
      sql(
        `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SELECT ops_enqueue_job('${workspace}','fixture.echo','backup-fixture','{"value":1}'::jsonb,now()); COMMIT;`,
        restored,
      ),
    ),
  ).toBe(job);
  expect(
    sql(
      `BEGIN; SET LOCAL ROLE service_role; SELECT id FROM ops_claim_jobs('restore-worker',1,10); COMMIT;`,
      restored,
    ),
  ).toContain(job);
}, 30000);
