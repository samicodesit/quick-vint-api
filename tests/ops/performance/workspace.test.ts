import { afterAll, beforeAll, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "../integration/psql";

let database: string;
let workspace: string;
const user = "a0000000-0000-4000-8000-000000002000";

function measured(query: string) {
  const plan = JSON.parse(
    sql(`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`, database),
  )[0];
  return {
    rows: plan.Plan["Actual Rows"] as number,
    executionMs: plan["Execution Time"] as number,
    planningMs: plan["Planning Time"] as number,
  };
}

beforeAll(() => {
  database = createTestDatabase();
  applyMigration(database, "migrations/2026-09-26_ops_core.sql");
  applyMigration(database, "migrations/2026-09-26_ops_inventory.sql");
  workspace = sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SELECT ops_bootstrap_workspace('20k performance fixture','c0000000-0000-4000-8000-000000002000'); COMMIT;`,
    database,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
  sql(
    `INSERT INTO ops_items(workspace_id,display_sku,normalized_sku,created_by,created_at)
     SELECT '${workspace}', 'PERF-' || lpad(n::text,5,'0'), 'PERF-' || lpad(n::text,5,'0'), '${user}',
            now() - (n || ' seconds')::interval
     FROM generate_series(1,20000) AS n;
     ANALYZE ops_items;`,
    database,
  );
});

afterAll(() => {
  if (database) dropTestDatabase(database);
});

it("measures indexed inventory pages and exact SKU lookup over 20,000 pieces", () => {
  expect(
    sql(
      `SELECT count(*) FROM ops_items WHERE workspace_id='${workspace}'`,
      database,
    ),
  ).toBe("20000");
  const firstPage = measured(
    `SELECT id, display_sku FROM ops_items WHERE workspace_id='${workspace}' ORDER BY created_at DESC,id DESC LIMIT 100`,
  );
  const deepPage = measured(
    `SELECT id, display_sku FROM ops_items WHERE workspace_id='${workspace}' AND created_at < now() - interval '19000 seconds' ORDER BY created_at DESC,id DESC LIMIT 100`,
  );
  const exactSku = measured(
    `SELECT id FROM ops_items WHERE workspace_id='${workspace}' AND normalized_sku='PERF-19999'`,
  );
  expect(firstPage.rows).toBe(100);
  expect(deepPage.rows).toBe(100);
  expect(exactSku.rows).toBe(1);
  console.info(
    `20k fixture PostgreSQL 12 EXPLAIN ANALYZE (ms): ${JSON.stringify({ firstPage, deepPage, exactSku })}`,
  );
}, 30000);
