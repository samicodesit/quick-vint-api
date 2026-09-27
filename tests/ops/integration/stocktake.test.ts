import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";

let database: string,
  workspace: string,
  locationA: string,
  locationB: string,
  itemA: string,
  itemB: string,
  take: string;
const owner = "a0000000-0000-4000-8000-000000001501";
const warehouse = "a0000000-0000-4000-8000-000000001502";
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
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspace = uuid(
    as(owner, `SELECT ops_bootstrap_workspace('Count test','${key(1500)}');`),
  );
  sql(
    `INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES('${workspace}','${warehouse}','warehouse');`,
    database,
  );
  locationA = object(
    as(
      owner,
      `SELECT ops_create_location('${workspace}',NULL,'A','A','${key(1501)}');`,
    ),
  ).locationId;
  locationB = object(
    as(
      owner,
      `SELECT ops_create_location('${workspace}',NULL,'B','B','${key(1502)}');`,
    ),
  ).locationId;
  itemA = object(
    as(
      owner,
      `SELECT ops_create_item('${workspace}','COUNT-A',NULL,NULL,'${key(1503)}');`,
    ),
  ).itemId;
  itemB = object(
    as(
      owner,
      `SELECT ops_create_item('${workspace}','COUNT-B',NULL,NULL,'${key(1504)}');`,
    ),
  ).itemId;
  as(
    owner,
    `SELECT ops_move_item('${workspace}','${itemA}','${locationA}','${key(1505)}',1);`,
  );
  as(
    owner,
    `SELECT ops_move_item('${workspace}','${itemB}','${locationA}','${key(1506)}',1);`,
  );
  take = object(
    as(
      owner,
      `SELECT ops_start_stocktake('${workspace}','${locationA}','${key(1507)}');`,
    ),
  ).stocktakeId;
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});
describe("location stocktake", () => {
  it("snapshots versions and rejects overlapping counts", () => {
    expect(
      sql(
        `SELECT count(*) FROM ops_stocktake_expected WHERE stocktake_id='${take}';`,
        database,
      ),
    ).toContain("2");
    expect(() =>
      as(
        owner,
        `SELECT ops_start_stocktake('${workspace}','${locationA}','${key(1508)}');`,
      ),
    ).toThrow();
  });
  it("deduplicates scans and distinguishes a moved item from missing stock", () => {
    as(
      warehouse,
      `SELECT ops_observe_stocktake('${workspace}','${take}','COUNT-A','${key(1509)}');`,
    );
    as(
      warehouse,
      `SELECT ops_observe_stocktake('${workspace}','${take}','COUNT-A','${key(1510)}');`,
    );
    expect(
      sql(
        `SELECT count(*) FROM ops_stocktake_observations WHERE stocktake_id='${take}' AND item_id='${itemA}';`,
        database,
      ),
    ).toContain("1");
    as(
      owner,
      `SELECT ops_move_item('${workspace}','${itemB}','${locationB}','${key(1511)}',2);`,
    );
    const result = object(
      as(owner, `SELECT ops_compare_stocktake('${workspace}','${take}');`),
    );
    expect(
      result.rows.find((row: { itemId: string }) => row.itemId === itemA)
        .classification,
    ).toBe("matched");
    expect(
      result.rows.find((row: { itemId: string }) => row.itemId === itemB)
        .classification,
    ).toBe("moved_or_changed");
    expect(() =>
      as(
        owner,
        `SELECT ops_resolve_stocktake('${workspace}','${take}','${itemB}','write_off','Not here',3,'${key(1512)}');`,
      ),
    ).toThrow();
  });
  it("requires manager approval for a genuine missing item", () => {
    const itemC = object(
      as(
        owner,
        `SELECT ops_create_item('${workspace}','COUNT-C',NULL,NULL,'${key(1513)}');`,
      ),
    ).itemId;
    as(
      owner,
      `SELECT ops_move_item('${workspace}','${itemC}','${locationB}','${key(1514)}',1);`,
    );
    const secondTake = object(
      as(
        owner,
        `SELECT ops_start_stocktake('${workspace}','${locationB}','${key(1515)}');`,
      ),
    ).stocktakeId;
    const version = Number(
      sql(`SELECT version FROM ops_items WHERE id='${itemC}';`, database).match(
        /\d+/,
      )![0],
    );
    expect(() =>
      as(
        warehouse,
        `SELECT ops_resolve_stocktake('${workspace}','${secondTake}','${itemC}','write_off','Missing','${version}','${key(1516)}');`,
      ),
    ).toThrow();
    const result = object(
      as(
        owner,
        `SELECT ops_resolve_stocktake('${workspace}','${secondTake}','${itemC}','write_off','Missing',${version},'${key(1517)}');`,
      ),
    );
    expect(result.decision).toBe("write_off");
    expect(
      sql(`SELECT custody FROM ops_items WHERE id='${itemC}';`, database),
    ).toContain("written_off");
  });
  it("closes a counted location and permits a new snapshot", () => {
    expect(
      object(as(owner, `SELECT ops_close_stocktake('${workspace}','${take}','${key(1518)}');`)).status,
    ).toBe("closed");
    expect(
      object(as(owner, `SELECT ops_start_stocktake('${workspace}','${locationA}','${key(1519)}');`)).status,
    ).toBe("open");
  });
});
