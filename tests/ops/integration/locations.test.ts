import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";

let database: string;
let workspaceId: string;
const userId = "a0000000-0000-4000-8000-000000000061";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function asUser(statement: string) {
  return sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; ${statement} COMMIT;`,
    database,
  );
}
function object(output: string) {
  return JSON.parse(
    output.split(/\r?\n/).find((line) => line.trim().startsWith("{"))!,
  );
}
function location(code: string, n: number, parent: string | null = null) {
  return object(
    asUser(
      `SELECT ops_create_location('${workspaceId}', ${parent ? `'${parent}'` : "NULL"}, '${code}', '${code}', '${key(n)}');`,
    ),
  );
}

beforeAll(() => {
  database = createTestDatabase();
  applyMigration(database, "migrations/2026-09-26_ops_core.sql");
  applyMigration(database, "migrations/2026-09-26_ops_inventory.sql");
  applyMigration(database, "migrations/2026-09-26_ops_locations.sql");
  workspaceId = asUser(
    `SELECT ops_bootstrap_workspace('Locations', '${key(60)}');`,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("T04 locations and movement", () => {
  it("sorts numeric location codes by number rather than text", () => {
    location("Box 2", 61);
    location("10", 62);
    location("2", 63);
    expect(
      sql(
        `SELECT string_agg(code,',' ORDER BY numeric_order NULLS LAST,normalized_code) FROM ops_locations WHERE workspace_id='${workspaceId}';`,
        database,
      ),
    ).toBe("2,10,Box 2");
    expect(
      object(
        asUser(
          `SELECT jsonb_build_object('locations',ops_list_locations('${workspaceId}'));`,
        ),
      ).locations.map((entry: { code: string }) => entry.code),
    ).toEqual(["2", "10", "Box 2"]);
  });

  it("rejects a hierarchy cycle and a cross-workspace parent", () => {
    const parent = location("ROOT", 64);
    const child = location("CHILD", 65, parent.locationId);
    expect(() =>
      asUser(
        `SELECT ops_set_location_parent('${workspaceId}', '${parent.locationId}', '${child.locationId}', '${key(66)}', 1);`,
      ),
    ).toThrow();
    const other = asUser(
      `SELECT ops_bootstrap_workspace('Other', '${key(67)}');`,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    const otherLocation = object(
      asUser(
        `SELECT ops_create_location('${other}', NULL, 'OTHER', 'Other', '${key(68)}');`,
      ),
    );
    expect(() =>
      asUser(
        `SELECT ops_set_location_parent('${workspaceId}', '${child.locationId}', '${otherLocation.locationId}', '${key(69)}', 1);`,
      ),
    ).toThrow();
  });

  it("moves one on-hand item once, rejects stale versions and occupied deletion", () => {
    const destination = location("B12", 70);
    expect(
      object(
        asUser(
          `SELECT ops_resolve_identifier('${workspaceId}', 'AL-L:${destination.locationId}');`,
        ),
      ).kind,
    ).toBe("location");
    const item = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key(71)}');`,
      ),
    );
    const move = () =>
      object(
        asUser(
          `SELECT ops_move_item('${workspaceId}', '${item.itemId}', '${destination.locationId}', '${key(72)}', 1);`,
        ),
      );
    const first = move();
    expect(first.version).toBe(2);
    expect(move()).toEqual(first);
    expect(
      sql(
        `SELECT count(*) FROM ops_item_movements WHERE item_id='${item.itemId}';`,
        database,
      ),
    ).toBe("1");
    expect(
      object(
        asUser(
          `SELECT ops_move_item('${workspaceId}', '${item.itemId}', '${destination.locationId}', '${key(78)}', 2);`,
        ),
      ).version,
    ).toBe(2);
    expect(
      sql(
        `SELECT count(*) FROM ops_item_movements WHERE item_id='${item.itemId}';`,
        database,
      ),
    ).toBe("1");
    expect(() =>
      asUser(
        `SELECT ops_move_item('${workspaceId}', '${item.itemId}', '${destination.locationId}', '${key(73)}', 1);`,
      ),
    ).toThrow();
    expect(() =>
      asUser(
        `SELECT ops_delete_location('${workspaceId}', '${destination.locationId}', '${key(74)}', 1);`,
      ),
    ).toThrow();
    sql(
      `UPDATE ops_items SET custody='outbound' WHERE id='${item.itemId}';`,
      database,
    );
    const second = location("B13", 75);
    expect(() =>
      asUser(
        `SELECT ops_move_item('${workspaceId}', '${item.itemId}', '${second.locationId}', '${key(76)}', 2);`,
      ),
    ).toThrow();
  });

  it("paginates filtered inventory and makes global scans read only", () => {
    const item = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', 'SCAN-ONE', NULL, NULL, '${key(77)}');`,
      ),
    );
    const secondItem = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', 'SCAN-TWO', NULL, NULL, '${key(79)}');`,
      ),
    );
    const first = object(
      asUser(
        `SELECT ops_list_inventory('${workspaceId}', 'SCAN', NULL, NULL, NULL, NULL, NULL, 1);`,
      ),
    );
    expect(first.items).toHaveLength(1);
    expect([item.itemId, secondItem.itemId]).toContain(first.items[0].id);
    expect(first.nextCursor).not.toBeNull();
    const secondPage = object(
      asUser(
        `SELECT ops_list_inventory('${workspaceId}', 'SCAN', NULL, NULL, NULL, '${first.nextCursor.createdAt}', '${first.nextCursor.id}', 1);`,
      ),
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].id).not.toBe(first.items[0].id);
    expect(secondPage.nextCursor).toBeNull();
    expect(first.items[0]).toHaveProperty("costMinor", null);
    const before = sql(
      `SELECT count(*) FROM ops_item_movements WHERE workspace_id='${workspaceId}';`,
      database,
    );
    const resolved = object(
      asUser(`SELECT ops_resolve_identifier('${workspaceId}', 'SCAN-ONE');`),
    );
    expect(resolved.kind).toBe("item");
    expect(resolved.items[0].itemId).toBe(item.itemId);
    const qr = object(
      asUser(
        `SELECT ops_resolve_identifier('${workspaceId}', 'AL-I:${item.itemId}');`,
      ),
    );
    expect(qr.kind).toBe("item");
    expect(
      sql(
        `SELECT count(*) FROM ops_item_movements WHERE workspace_id='${workspaceId}';`,
        database,
      ),
    ).toBe(before);
    const warehouse = "a0000000-0000-4000-8000-000000000062";
    sql(
      `INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES('${workspaceId}','${warehouse}','warehouse');`,
      database,
    );
    const restricted = object(
      sql(
        `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${warehouse}'; SELECT ops_list_inventory('${workspaceId}', 'SCAN', NULL, NULL, NULL, NULL, NULL, 1); COMMIT;`,
        database,
      ),
    );
    expect(restricted.items[0]).not.toHaveProperty("costMinor");
    expect(() =>
      asUser(
        `SELECT ops_list_inventory('${workspaceId}', NULL, NULL, NULL, NULL, NULL, NULL, 101);`,
      ),
    ).toThrow();
  });

  it("returns multiple physical candidates for a shared retail EAN", () => {
    const first = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key(80)}');`,
      ),
    );
    const second = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key(81)}');`,
      ),
    );
    asUser(
      `SELECT ops_add_identifier('${workspaceId}', '${first.itemId}', 'ean', '9876543210000', '${key(82)}', 1);`,
    );
    asUser(
      `SELECT ops_add_identifier('${workspaceId}', '${second.itemId}', 'ean', '9876543210000', '${key(83)}', 1);`,
    );
    const scan = object(
      asUser(
        `SELECT ops_resolve_identifier('${workspaceId}', '9876543210000');`,
      ),
    );
    expect(scan.kind).toBe("ambiguous");
    expect(scan.items).toHaveLength(2);
  });
});
