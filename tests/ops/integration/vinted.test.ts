import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";

let database: string;
const userId = "a0000000-0000-4000-8000-000000000901";
const webhookId = "b0000000-0000-4000-8000-000000000901";
const key = "c0000000-0000-4000-8000-000000000901";
const asUser = (statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; ${statement} COMMIT;`,
    database,
  );
const asService = (statement: string) =>
  sql(`BEGIN; SET LOCAL ROLE service_role; ${statement} COMMIT;`, database);

beforeAll(() => {
  database = createTestDatabase();
  for (const name of [
    "core",
    "inventory",
    "locations",
    "media",
    "jobs",
    "analysis",
    "listings",
    "handoff",
    "vinted",
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("Vinted event persistence", () => {
  it("stores a verified connection and deduplicates the same raw delivery", () => {
    const workspaceId = asUser(
      `SELECT ops_bootstrap_workspace('Vinted test','${key}');`,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    const connectionId = asService(
      `INSERT INTO ops_vinted_connections(workspace_id,environment,webhook_id,contract_version,contract_sha256) VALUES('${workspaceId}','sandbox','${webhookId}','v0.360.0','abc') RETURNING id;`,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    asService(
      `INSERT INTO ops_vinted_events(connection_id,workspace_id,webhook_id,body_sha256,event_type,payload) VALUES('${connectionId}','${workspaceId}','${webhookId}','same-body','ITEM_SOLD','{"event_type":"ITEM_SOLD"}'::jsonb);`,
    );
    expect(() =>
      asService(
        `INSERT INTO ops_vinted_events(connection_id,workspace_id,webhook_id,body_sha256,event_type,payload) VALUES('${connectionId}','${workspaceId}','${webhookId}','same-body','ITEM_SOLD','{}'::jsonb);`,
      ),
    ).toThrow();
    expect(
      asUser(
        `SELECT count(*) FROM ops_vinted_events WHERE connection_id='${connectionId}';`,
      ),
    ).toMatch(/1/);
    expect(
      asUser(
        `SELECT publish_verified FROM ops_vinted_connections WHERE id='${connectionId}';`,
      ),
    ).toContain("f");
  });
});
