import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
  sqlAsync,
} from "./psql";

let database: string;
let workspace: string;
const user = "a0000000-0000-4000-8000-000000001101";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uuid = (output: string) =>
  output.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
const object = (output: string) =>
  JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith("{"))!);
const asUser = (statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; ${statement} COMMIT;`,
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
    "orders",
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspace = uuid(
    asUser(`SELECT ops_bootstrap_workspace('Order test','${key(1100)}');`),
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

function item(n: number): string {
  return object(
    asUser(
      `SELECT ops_create_item('${workspace}','SKU-${n}',NULL,NULL,'${key(n)}');`,
    ),
  ).itemId;
}
function order(items: string[], paid: boolean, n: number) {
  const lines = JSON.stringify(
    items.map((itemId, index) => ({ itemId, title: `Garment ${index + 1}` })),
  );
  return object(
    asUser(
      `SELECT ops_create_manual_order('${workspace}',${paid},'EUR',6000,'${lines}'::jsonb,'${key(n)}');`,
    ),
  );
}
function reserve(orderId: string, n: number) {
  return object(
    asUser(
      `SELECT ops_reserve_order('${workspace}','${orderId}',1,'${key(n)}');`,
    ),
  );
}

describe("manual order reservations", () => {
  it("reserves a paid bundle atomically and prevents a double sale", () => {
    const first = item(1101);
    const second = item(1102);
    const bundle = order([first, second], true, 1103);
    expect(reserve(bundle.orderId, 1104).lineCount).toBe(2);
    expect(reserve(bundle.orderId, 1104).status).toBe("reserved");
    const competing = order([first], true, 1105);
    expect(() => reserve(competing.orderId, 1106)).toThrow();
    expect(
      asUser(
        `SELECT count(*) FROM ops_reservations WHERE order_id='${competing.orderId}';`,
      ),
    ).toMatch(/0/);
  });

  it("keeps unpaid orders out of the pick queue", () => {
    const piece = item(1107);
    const draft = order([piece], false, 1108);
    expect(() => reserve(draft.orderId, 1109)).toThrow();
    expect(
      sql(
        `SELECT status FROM ops_orders WHERE id='${draft.orderId}';`,
        database,
      ),
    ).toContain("unpaid");
  });

  it("rolls back a bundle when its later item is unavailable", () => {
    const free = item(1110);
    const unavailable = item(1111);
    const blocker = order([unavailable], true, 1112);
    reserve(blocker.orderId, 1113);
    const bundle = order([free, unavailable], true, 1114);
    expect(() => reserve(bundle.orderId, 1115)).toThrow();
    expect(
      asUser(
        `SELECT count(*) FROM ops_reservations WHERE order_id='${bundle.orderId}';`,
      ),
    ).toMatch(/0/);
  });

  it("deduplicates exact provider IDs and leaves unmapped lines unpickable", () => {
    const connection = uuid(
      asService(
        `INSERT INTO ops_vinted_connections(workspace_id,environment,contract_version,contract_sha256) VALUES('${workspace}','sandbox','v0.360.0','abc') RETURNING id;`,
      ),
    );
    const externalId = "9223372036854775807";
    const lines =
      '[{"externalLineId":"' +
      externalId +
      ':0","externalItemId":"00000000-0000-0000-0000-000000000000","itemReference":"UNKNOWN","title":"Unknown garment"}]';
    const ingest = (status: string, at: string) =>
      object(
        asService(
          `SELECT ops_ingest_order('${workspace}','${connection}','${externalId}','${status}','${at}'::timestamptz,'EUR',6000,'${lines}'::jsonb);`,
        ),
      );
    const first = ingest("READY_TO_BE_SHIPPED", "2026-09-26T12:00:00Z");
    expect(first.duplicate).toBe(false);
    expect(first.issueCount).toBe(1);
    expect(ingest("CREATED", "2026-09-26T11:00:00Z").duplicate).toBe(true);
    expect(
      sql(
        `SELECT status FROM ops_orders WHERE id='${first.orderId}';`,
        database,
      ),
    ).toContain("confirmed");
    expect(
      sql(
        `SELECT count(*) FROM ops_order_lines WHERE order_id='${first.orderId}';`,
        database,
      ),
    ).toMatch(/1/);
    expect(() => reserve(first.orderId, 1116)).toThrow();
  });

  it("lets only one concurrent order reserve the same physical piece", async () => {
    const piece = item(1117);
    const left = order([piece], true, 1118);
    const right = order([piece], true, 1119);
    const statement = (orderId: string, n: number) =>
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SELECT ops_reserve_order('${workspace}','${orderId}',1,'${key(n)}'); COMMIT;`;
    const outcomes = await Promise.allSettled([
      sqlAsync(statement(left.orderId, 1120), database),
      sqlAsync(statement(right.orderId, 1121), database),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      sql(
        `SELECT count(*) FROM ops_reservations WHERE workspace_id='${workspace}' AND item_id='${piece}' AND active;`,
        database,
      ),
    ).toMatch(/1/);
  });
});
