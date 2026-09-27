import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";
let database: string, workspace: string, orderId: string;
const owner = "a0000000-0000-4000-8000-000000001601";
const warehouse = "a0000000-0000-4000-8000-000000001602";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uuid = (value: string) =>
  value.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
const object = (value: string) =>
  JSON.parse(value.split(/\r?\n/).find((line) => line.startsWith("{"))!);
const as = (user: string, statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; ${statement} COMMIT;`,
    database,
  );
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
    "orders",
    "pick",
    "pack",
    "returns",
    "stocktake",
    "finance",
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspace = uuid(
    as(owner, `SELECT ops_bootstrap_workspace('Finance test','${key(1600)}');`),
  );
  sql(
    `INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES('${workspace}','${warehouse}','warehouse');`,
    database,
  );
  const item = object(
    as(
      owner,
      `SELECT ops_create_item('${workspace}','COST-1',NULL,NULL,'${key(1601)}');`,
    ),
  ).itemId;
  as(
    owner,
    `SELECT ops_correct_item_cost('${workspace}','${item}',1200,'EUR','Known lot receipt','${key(1602)}',1);`,
  );
  orderId = object(
    as(
      owner,
      `SELECT ops_create_manual_order('${workspace}',true,'EUR',6000,'[{"itemId":"${item}","title":"Coat"}]'::jsonb,'${key(1603)}');`,
    ),
  ).orderId;
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});
describe("financial observations", () => {
  it("captures acquisition at sale and deduplicates source keys", () => {
    expect(
      sql(
        `SELECT acquisition_cost_minor,acquisition_currency,acquisition_basis FROM ops_order_lines WHERE order_id='${orderId}';`,
        database,
      ),
    ).toContain("1200|EUR|sale_snapshot");
    const command = `SELECT ops_record_financial_observation('${workspace}','${orderId}','seller_fee',300,'EUR','manual','fee-1','2026-09-26T12:00:00Z','${key(1604)}');`;
    const first = object(as(owner, command));
    expect(object(as(owner, command)).entryId).toBe(first.entryId);
    const duplicate = object(
      as(
        owner,
        `SELECT ops_record_financial_observation('${workspace}','${orderId}','seller_fee',300,'EUR','manual','fee-1','2026-09-26T12:00:00Z','${key(1605)}');`,
      ),
    );
    expect(duplicate.entryId).toBe(first.entryId);
    expect(
      sql(
        `SELECT count(*) FROM ops_financial_entries WHERE order_id='${orderId}';`,
        database,
      ),
    ).toContain("1");
    expect(() =>
      as(
        owner,
        `SELECT ops_record_financial_observation('${workspace}','${orderId}','seller_fee',500,'EUR','manual','fee-1','2026-09-26T12:00:00Z','${key(1606)}');`,
      ),
    ).toThrow();
  });
  it("denies warehouse finance writes and mixed currency", () => {
    expect(() =>
      as(
        warehouse,
        `SELECT ops_record_financial_observation('${workspace}','${orderId}','packaging',100,'EUR','manual','pack-1','2026-09-26T12:00:00Z','${key(1607)}');`,
      ),
    ).toThrow();
    expect(() =>
      as(
        owner,
        `SELECT ops_record_financial_observation('${workspace}','${orderId}','packaging',100,'GBP','manual','pack-2','2026-09-26T12:00:00Z','${key(1608)}');`,
      ),
    ).toThrow();
  });
});
