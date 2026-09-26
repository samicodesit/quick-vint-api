import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";
import { seedLocalWorkspace } from "../../../scripts/ops-seed.mjs";

const userA = "a0000000-0000-4000-8000-000000000001";
const userB = "b0000000-0000-4000-8000-000000000002";
let database: string;

beforeAll(() => {
  database = createTestDatabase();
  applyMigration(database, "migrations/2026-09-26_ops_core.sql");
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("T01 core tenant isolation", () => {
  it("seeds only the isolated test database", () => {
    seedLocalWorkspace(
      `postgresql://postgres@127.0.0.1:${process.env.OPS_TEST_PGPORT}/${database}`,
      "test",
      process.env.OPS_TEST_PSQL!,
    );
    expect(
      sql(
        "SELECT count(*) FROM ops_workspaces WHERE name='Fixture Seller A';",
        database,
      ),
    ).toBe("1");
  });
  it("rejects unauthenticated bootstrap", () => {
    expect(() =>
      sql(
        "BEGIN; SET LOCAL ROLE authenticated; SELECT ops_bootstrap_workspace('No user', gen_random_uuid()); COMMIT;",
        database,
      ),
    ).toThrow();
  });

  it("bootstraps once and detects a changed idempotency payload", () => {
    const key = "c0000000-0000-4000-8000-000000000003";
    const first = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT ops_bootstrap_workspace('Seller A', '${key}'::uuid); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)?.[0];
    const replay = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT ops_bootstrap_workspace('Seller A', '${key}'::uuid); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)?.[0];
    expect(first).toBeTruthy();
    expect(replay).toBe(first);
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT ops_bootstrap_workspace('Changed', '${key}'::uuid); COMMIT;`,
        database,
      ),
    ).toThrow();
  });

  it("hides another workspace and revoked membership", () => {
    const workspaceA = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT ops_bootstrap_workspace('A', 'c0000000-0000-4000-8000-000000000004'::uuid); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)?.[0];
    const workspaceB = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userB}'; SELECT ops_bootstrap_workspace('B', 'c0000000-0000-4000-8000-000000000005'::uuid); COMMIT;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)?.[0];
    expect(workspaceA).toBeTruthy();
    expect(workspaceB).toBeTruthy();
    const visible = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT id FROM ops_workspaces ORDER BY id; COMMIT;`,
      database,
    );
    expect(visible).toContain(workspaceA);
    expect(visible).not.toContain(workspaceB);
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES ('${workspaceB}','${userA}','owner'); COMMIT;`,
        database,
      ),
    ).toThrow();
    const otherAudit = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT workspace_id FROM ops_audit_events WHERE workspace_id='${workspaceB}'; COMMIT;`,
      database,
    );
    expect(otherAudit).not.toContain(workspaceB);
    sql(
      `UPDATE ops_memberships SET active=false WHERE workspace_id='${workspaceA}' AND user_id='${userA}';`,
      database,
    );
    const afterRevocation = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userA}'; SELECT id FROM ops_workspaces WHERE id='${workspaceA}'; COMMIT;`,
      database,
    );
    expect(afterRevocation).not.toContain(workspaceA);
  });
});
