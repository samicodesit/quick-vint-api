import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
  sqlAsync,
} from "./psql";

let database: string;
let workspaceId: string;
const userId = "a0000000-0000-4000-8000-000000000021";

function authenticated(statement: string) {
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

beforeAll(() => {
  database = createTestDatabase();
  applyMigration(database, "migrations/2026-09-26_ops_core.sql");
  applyMigration(database, "migrations/2026-09-26_ops_inventory.sql");
  workspaceId = authenticated(
    "SELECT ops_bootstrap_workspace('Inventory', 'c0000000-0000-4000-8000-000000000021');",
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("T03 physical identity", () => {
  it("creates a draft without cost or optional metadata and replays one command", () => {
    const key = "c0000000-0000-4000-8000-000000000022";
    const create = () =>
      object(
        authenticated(
          `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key}');`,
        ),
      );
    const first = create();
    expect(first).toMatchObject({ version: 1 });
    expect(first.itemId).toMatch(/[a-f0-9-]{36}/);
    expect(first.displaySku).toMatch(/^AL-[0-9]{6}$/);
    expect(create()).toEqual(first);
    expect(
      sql(
        `SELECT cost_minor IS NULL FROM ops_items WHERE id='${first.itemId}';`,
        database,
      ),
    ).toBe("t");
  });

  it("preserves an existing SKU alias and lets two pieces share a retail EAN", () => {
    const first = object(
      authenticated(
        `SELECT ops_create_item('${workspaceId}', 'OLD-42', NULL, NULL, 'c0000000-0000-4000-8000-000000000023');`,
      ),
    );
    const second = object(
      authenticated(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, 'c0000000-0000-4000-8000-000000000024');`,
      ),
    );
    expect(first.displaySku).toBe("OLD-42");
    authenticated(
      `SELECT ops_add_identifier('${workspaceId}', '${first.itemId}', 'ean', '1234567890123', 'c0000000-0000-4000-8000-000000000025', 1);`,
    );
    authenticated(
      `SELECT ops_add_identifier('${workspaceId}', '${second.itemId}', 'ean', '1234567890123', 'c0000000-0000-4000-8000-000000000026', 1);`,
    );
    expect(
      sql(
        `SELECT count(*) FROM ops_item_identifiers WHERE kind='ean' AND normalized='1234567890123';`,
        database,
      ),
    ).toBe("2");
    expect(() =>
      authenticated(
        `SELECT ops_create_item('${workspaceId}', 'old-42', NULL, NULL, 'c0000000-0000-4000-8000-000000000027');`,
      ),
    ).toThrow();
  });

  it("allocates a EUR 10 lot exactly and audits a human cost correction", () => {
    const lot = object(
      authenticated(
        `SELECT ops_create_lot('${workspaceId}', 'Market bag', 1000, 'EUR', NULL, 'c0000000-0000-4000-8000-000000000030');`,
      ),
    );
    const items = [31, 32, 33].map((n) =>
      object(
        authenticated(
          `SELECT ops_create_item('${workspaceId}', NULL, NULL, '${lot.lotId}', 'c0000000-0000-4000-8000-${String(n).padStart(12, "0")}');`,
        ),
      ),
    );
    const allocation = object(
      authenticated(
        `SELECT ops_allocate_lot_cost('${workspaceId}', '${lot.lotId}', '{}'::jsonb, 'c0000000-0000-4000-8000-000000000034', 1);`,
      ),
    );
    expect(Object.values(allocation.costs).sort()).toEqual([333, 333, 334]);
    expect(
      Object.values(allocation.costs).reduce(
        (sum: number, cost) => sum + Number(cost),
        0,
      ),
    ).toBe(1000);
    expect(
      object(
        authenticated(
          `SELECT ops_allocate_lot_cost('${workspaceId}', '${lot.lotId}', '{}'::jsonb, 'c0000000-0000-4000-8000-000000000034', 1);`,
        ),
      ),
    ).toEqual(allocation);
    const correction = object(
      authenticated(
        `SELECT ops_correct_item_cost('${workspaceId}', '${items[0].itemId}', 400, 'EUR', 'Receipt correction', 'c0000000-0000-4000-8000-000000000035', 2);`,
      ),
    );
    expect(correction.version).toBe(3);
    expect(
      sql(
        `SELECT cost_minor FROM ops_items WHERE id='${items[0].itemId}';`,
        database,
      ),
    ).toBe("400");
    expect(
      sql(
        `SELECT count(*) FROM ops_audit_events WHERE workspace_id='${workspaceId}' AND action='item.cost.correct';`,
        database,
      ),
    ).toBe("1");
    expect(
      object(
        sql(
          `SELECT details FROM ops_audit_events WHERE workspace_id='${workspaceId}' AND action='item.cost.correct';`,
          database,
        ),
      ),
    ).toEqual({ reason: "Receipt correction" });
    expect(
      sql(
        `SELECT new_minor FROM ops_cost_corrections WHERE workspace_id='${workspaceId}' AND item_id='${items[0].itemId}';`,
        database,
      ),
    ).toBe("400");
    const warehouse = "a0000000-0000-4000-8000-000000000023";
    sql(
      `INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES('${workspaceId}','${warehouse}','warehouse');`,
      database,
    );
    expect(
      sql(
        `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${warehouse}'; SELECT count(*) FROM ops_cost_corrections WHERE workspace_id='${workspaceId}'; COMMIT;`,
        database,
      ),
    ).toMatch(/\b0\b/);
  });

  it("keeps unknown lot cost distinct from zero and rejects allocation overrun", () => {
    const unknown = object(
      authenticated(
        `SELECT ops_create_lot('${workspaceId}', 'Donation', NULL, NULL, NULL, 'c0000000-0000-4000-8000-000000000036');`,
      ),
    );
    const zero = object(
      authenticated(
        `SELECT ops_create_lot('${workspaceId}', 'Gift', 0, 'EUR', NULL, 'c0000000-0000-4000-8000-000000000037');`,
      ),
    );
    expect(
      sql(
        `SELECT total_cost_minor IS NULL FROM ops_lots WHERE id='${unknown.lotId}';`,
        database,
      ),
    ).toBe("t");
    expect(
      sql(
        `SELECT total_cost_minor FROM ops_lots WHERE id='${zero.lotId}';`,
        database,
      ),
    ).toBe("0");
    const item = object(
      authenticated(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, '${zero.lotId}', 'c0000000-0000-4000-8000-000000000038');`,
      ),
    );
    expect(() =>
      authenticated(
        `SELECT ops_allocate_lot_cost('${workspaceId}', '${zero.lotId}', '{"${item.itemId}":1}'::jsonb, 'c0000000-0000-4000-8000-000000000039', 1);`,
      ),
    ).toThrow();
  });

  it("blocks direct cost table reads from an authenticated session", () => {
    expect(() =>
      authenticated("SELECT cost_minor FROM ops_items LIMIT 1;"),
    ).toThrow();
    expect(() =>
      authenticated("SELECT total_cost_minor FROM ops_lots LIMIT 1;"),
    ).toThrow();
  });

  it("allows only one physical item for concurrent requests with the same seller SKU", async () => {
    const command = (key: string) =>
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; SELECT ops_create_item('${workspaceId}', 'RACE-ONE', NULL, NULL, '${key}'); COMMIT;`;
    const results = await Promise.allSettled([
      sqlAsync(command("c0000000-0000-4000-8000-000000000041"), database),
      sqlAsync(command("c0000000-0000-4000-8000-000000000042"), database),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      sql(
        `SELECT count(*) FROM ops_items WHERE workspace_id='${workspaceId}' AND normalized_sku='RACE-ONE';`,
        database,
      ),
    ).toBe("1");
  });

  it("preserves an identifier for a second authorised database session", () => {
    const secondUser = "a0000000-0000-4000-8000-000000000022";
    const created = object(
      authenticated(
        `SELECT ops_create_item('${workspaceId}', 'SECOND-SESSION', NULL, NULL, 'c0000000-0000-4000-8000-000000000043');`,
      ),
    );
    sql(
      `INSERT INTO ops_memberships(workspace_id,user_id,role,active) VALUES('${workspaceId}','${secondUser}','warehouse',true);`,
      database,
    );
    const visible = sql(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${secondUser}'; SELECT value FROM ops_item_identifiers WHERE workspace_id='${workspaceId}' AND item_id='${created.itemId}'; COMMIT;`,
      database,
    );
    expect(visible).toContain("SECOND-SESSION");
  });

  it("skips a pre-existing generated-looking SKU", () => {
    const next = sql(
      `SELECT next_item_number FROM ops_workspaces WHERE id='${workspaceId}';`,
      database,
    );
    const reserved = `AL-${next.padStart(6, "0")}`;
    authenticated(
      `SELECT ops_create_item('${workspaceId}', '${reserved}', NULL, NULL, 'c0000000-0000-4000-8000-000000000044');`,
    );
    const generated = object(
      authenticated(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, 'c0000000-0000-4000-8000-000000000045');`,
      ),
    );
    expect(generated.displaySku).not.toBe(reserved);
  });
});
