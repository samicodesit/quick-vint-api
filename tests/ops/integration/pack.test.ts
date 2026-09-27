import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";
let database: string, workspace: string;
const user = "a0000000-0000-4000-8000-000000001301";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uuid = (value: string) =>
  value.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
const object = (value: string) =>
  JSON.parse(value.split(/\r?\n/).find((line) => line.startsWith("{"))!);
const asUser = (statement: string) =>
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
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspace = uuid(
    asUser(`SELECT ops_bootstrap_workspace('Pack test','${key(1300)}');`),
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});
function pickedOrder(n: number, count: number) {
  const items = Array.from({ length: count }, (_, index) => ({
    itemId: object(
      asUser(
        `SELECT ops_create_item('${workspace}','SKU-${n}-${index}',NULL,NULL,'${key(n + index)}');`,
      ),
    ).itemId,
    code: `SKU-${n}-${index}`,
  }));
  const lines = JSON.stringify(
    items.map(({ itemId }) => ({ itemId, title: "Garment" })),
  );
  const order = object(
    asUser(
      `SELECT ops_create_manual_order('${workspace}',true,NULL,NULL,'${lines}'::jsonb,'${key(n + 20)}');`,
    ),
  );
  asUser(
    `SELECT ops_reserve_order('${workspace}','${order.orderId}',1,'${key(n + 21)}');`,
  );
  const wave = object(
    asUser(
      `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${order.orderId}"}]'::jsonb,'${key(n + 22)}');`,
    ),
  );
  const tasks = sql(
    `SELECT id,item_id FROM ops_pick_tasks WHERE wave_id='${wave.waveId}' ORDER BY item_id;`,
    database,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  for (let index = 0; index < tasks.length; index++) {
    const taskId = tasks[index].split("|")[0],
      itemId = tasks[index].split("|")[1];
    const claim = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${taskId}',1,'${key(n + 30 + index)}');`,
      ),
    );
    const code = items.find((item) => item.itemId === itemId)!.code;
    asUser(
      `SELECT ops_verify_pick('${workspace}','${taskId}','${claim.claimId}','${code}',NULL,'${key(n + 40 + index)}');`,
    );
  }
  return { orderId: order.orderId, items };
}
function label(orderId: string, n: number) {
  return uuid(
    sql(
      `INSERT INTO ops_labels(workspace_id,order_id,source,storage_path,sha256,bytes,created_by) VALUES('${workspace}','${orderId}','manual_upload','${workspace}/${orderId}/label-${n}.pdf','${"a".repeat(64)}',100,'${user}') RETURNING id;`,
      database,
    ),
  );
}
describe("packing and physical handover", () => {
  it("keeps printing separate from handover and dispatches only a complete package", () => {
    const order = pickedOrder(1301, 2);
    const pack = object(
      asUser(
        `SELECT ops_start_pack('${workspace}','${order.orderId}','${key(1350)}');`,
      ),
    );
    const document = label(order.orderId, 1);
    asUser(
      `SELECT ops_attach_label('${workspace}','${pack.sessionId}','${document}','${key(1351)}');`,
    );
    expect(
      object(
        asUser(
          `SELECT ops_attach_label('${workspace}','${pack.sessionId}','${document}','${key(1357)}');`,
        ),
      ).labelId,
    ).toBe(document);
    expect(
      sql(
        `SELECT status FROM ops_orders WHERE id='${order.orderId}';`,
        database,
      ),
    ).toContain("picking");
    expect(() =>
      asUser(
        `SELECT ops_record_handover('${workspace}','${pack.shipmentId}','${key(1352)}');`,
      ),
    ).toThrow();
    asUser(
      `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','${order.items[0].code}','${key(1353)}');`,
    );
    expect(() =>
      asUser(
        `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','${order.items[0].code}','${key(1354)}');`,
      ),
    ).toThrow();
    asUser(
      `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','${order.items[1].code}','${key(1355)}');`,
    );
    expect(
      object(
        asUser(
          `SELECT ops_record_handover('${workspace}','${pack.shipmentId}','${key(1356)}');`,
        ),
      ).status,
    ).toBe("handed_over");
    expect(
      object(
        asUser(
          `SELECT ops_record_handover('${workspace}','${pack.shipmentId}','${key(1356)}');`,
        ),
      ).status,
    ).toBe("handed_over");
    expect(
      sql(
        `SELECT status FROM ops_orders WHERE id='${order.orderId}';`,
        database,
      ),
    ).toContain("dispatched");
    expect(
      sql(
        `SELECT count(*) FROM ops_items WHERE id IN('${order.items[0].itemId}','${order.items[1].itemId}') AND custody='outbound';`,
        database,
      ),
    ).toMatch(/2/);
  });
  it("rejects a label for another order and a late cancellation", () => {
    const left = pickedOrder(1401, 1),
      right = pickedOrder(1501, 1);
    const pack = object(
      asUser(
        `SELECT ops_start_pack('${workspace}','${left.orderId}','${key(1450)}');`,
      ),
    );
    const wrong = label(right.orderId, 2);
    expect(() =>
      asUser(
        `SELECT ops_attach_label('${workspace}','${pack.sessionId}','${wrong}','${key(1451)}');`,
      ),
    ).toThrow();
    const correct = label(left.orderId, 3);
    asUser(
      `SELECT ops_attach_label('${workspace}','${pack.sessionId}','${correct}','${key(1452)}');`,
    );
    asUser(
      `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','${left.items[0].code}','${key(1453)}');`,
    );
    sql(
      `UPDATE ops_orders SET status='cancelled' WHERE id='${left.orderId}';`,
      database,
    );
    expect(() =>
      asUser(
        `SELECT ops_record_handover('${workspace}','${pack.shipmentId}','${key(1454)}');`,
      ),
    ).toThrow();
  });
});
