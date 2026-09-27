import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";
let database: string,
  workspace: string,
  orderId: string,
  first: string,
  second: string;
const user = "a0000000-0000-4000-8000-000000001401";
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
    "returns",
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspace = uuid(
    asUser(`SELECT ops_bootstrap_workspace('Return test','${key(1400)}');`),
  );
  first = object(
    asUser(
      `SELECT ops_create_item('${workspace}','RETURN-1',NULL,NULL,'${key(1401)}');`,
    ),
  ).itemId;
  second = object(
    asUser(
      `SELECT ops_create_item('${workspace}','RETURN-2',NULL,NULL,'${key(1402)}');`,
    ),
  ).itemId;
  const order = object(
    asUser(
      `SELECT ops_create_manual_order('${workspace}',true,'EUR',6000,'[{"itemId":"${first}","title":"First"},{"itemId":"${second}","title":"Second"}]'::jsonb,'${key(1403)}');`,
    ),
  );
  orderId = order.orderId;
  asUser(
    `SELECT ops_reserve_order('${workspace}','${orderId}',1,'${key(1404)}');`,
  );
  const wave = object(
    asUser(
      `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${orderId}"}]'::jsonb,'${key(1405)}');`,
    ),
  );
  const tasks = sql(
    `SELECT id,item_id FROM ops_pick_tasks WHERE wave_id='${wave.waveId}';`,
    database,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  tasks.forEach((row, index) => {
    const [taskId, itemId] = row.split("|");
    const claim = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${taskId}',1,'${key(1410 + index)}');`,
      ),
    );
    asUser(
      `SELECT ops_verify_pick('${workspace}','${taskId}','${claim.claimId}','${itemId === first ? "RETURN-1" : "RETURN-2"}',NULL,'${key(1420 + index)}');`,
    );
  });
  const pack = object(
    asUser(
      `SELECT ops_start_pack('${workspace}','${orderId}','${key(1430)}');`,
    ),
  );
  asUser(
    `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','RETURN-1','${key(1431)}');`,
  );
  asUser(
    `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','RETURN-2','${key(1432)}');`,
  );
  const label = uuid(
    sql(
      `INSERT INTO ops_labels(workspace_id,order_id,source,storage_path,sha256,bytes,created_by) VALUES('${workspace}','${orderId}','manual_upload','${workspace}/${orderId}/label.pdf','${"a".repeat(64)}',100,'${user}') RETURNING id;`,
      database,
    ),
  );
  asUser(
    `SELECT ops_attach_label('${workspace}','${pack.sessionId}','${label}','${key(1433)}');`,
  );
  asUser(
    `SELECT ops_record_handover('${workspace}','${pack.shipmentId}','${key(1434)}');`,
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});
describe("return custody", () => {
  it("keeps refunded stock outbound until the exact garment is received", () => {
    sql(
      `INSERT INTO ops_refund_observations(workspace_id,order_id,source,source_key,amount_minor,currency,observed_at) VALUES('${workspace}','${orderId}','fixture','refund-1',1200,'EUR',now());`,
      database,
    );
    expect(
      sql(`SELECT custody FROM ops_items WHERE id='${first}';`, database),
    ).toContain("outbound");
    expect(() =>
      asUser(
        `SELECT ops_record_return_receipt('${workspace}','${orderId}','["WRONG"]'::jsonb,'${key(1440)}');`,
      ),
    ).toThrow();
    const receipt = object(
      asUser(
        `SELECT ops_record_return_receipt('${workspace}','${orderId}','["RETURN-1"]'::jsonb,'${key(1441)}');`,
      ),
    );
    expect(receipt.receivedLines).toBe(1);
    expect(
      object(
        asUser(
          `SELECT ops_record_return_receipt('${workspace}','${orderId}','["RETURN-1"]'::jsonb,'${key(1441)}');`,
        ),
      ).returnId,
    ).toBe(receipt.returnId);
    expect(
      sql(`SELECT custody FROM ops_items WHERE id='${first}';`, database),
    ).toContain("return_quarantine");
    expect(
      sql(`SELECT custody FROM ops_items WHERE id='${second}';`, database),
    ).toContain("outbound");
    const line = uuid(
      sql(
        `SELECT id FROM ops_return_lines WHERE return_id='${receipt.returnId}';`,
        database,
      ),
    );
    expect(() =>
      asUser(
        `SELECT ops_restock_return('${workspace}','${line}',NULL,3,'${key(1442)}');`,
      ),
    ).toThrow();
    asUser(
      `SELECT ops_inspect_return('${workspace}','${line}','resellable','Clean on receipt','${key(1443)}');`,
    );
    expect(
      object(
        asUser(
          `SELECT ops_inspect_return('${workspace}','${line}','resellable','Clean on receipt','${key(1443)}');`,
        ),
      ).status,
    ).toBe("resellable");
    expect(() =>
      asUser(
        `SELECT ops_inspect_return('${workspace}','${line}','damaged','Clean on receipt','${key(1443)}');`,
      ),
    ).toThrow();
    const version = Number(
      sql(`SELECT version FROM ops_items WHERE id='${first}';`, database).match(
        /\d+/,
      )![0],
    );
    expect(
      object(
        asUser(
          `SELECT ops_restock_return('${workspace}','${line}',NULL,${version},'${key(1444)}');`,
        ),
      ).status,
    ).toBe("restocked");
    expect(
      object(
        asUser(
          `SELECT ops_restock_return('${workspace}','${line}',NULL,${version},'${key(1444)}');`,
        ),
      ).status,
    ).toBe("restocked");
    expect(() =>
      asUser(
        `SELECT ops_restock_return('${workspace}','${line}',NULL,${version + 1},'${key(1444)}');`,
      ),
    ).toThrow();
    expect(
      sql(
        `SELECT count(*) FROM ops_audit_events WHERE workspace_id='${workspace}' AND aggregate_id='${line}' AND action IN ('return.inspect','return.restock');`,
        database,
      ),
    ).toBe("2");
    expect(
      sql(`SELECT custody FROM ops_items WHERE id='${first}';`, database),
    ).toContain("on_hand");
    expect(
      sql(
        `SELECT count(*) FROM ops_order_lines WHERE order_id='${orderId}' AND item_id='${first}';`,
        database,
      ),
    ).toMatch(/1/);
  });
  it("keeps a damaged partial-bundle return out of available stock", () => {
    const receipt = object(
      asUser(
        `SELECT ops_record_return_receipt('${workspace}','${orderId}','["RETURN-2"]'::jsonb,'${key(1445)}');`,
      ),
    );
    const line = uuid(
      sql(
        `SELECT id FROM ops_return_lines WHERE return_id='${receipt.returnId}';`,
        database,
      ),
    );
    asUser(
      `SELECT ops_inspect_return('${workspace}','${line}','damaged','Torn seam','${key(1446)}');`,
    );
    expect(() =>
      asUser(
        `SELECT ops_restock_return('${workspace}','${line}',NULL,4,'${key(1447)}');`,
      ),
    ).toThrow();
    expect(
      sql(`SELECT custody FROM ops_items WHERE id='${second}';`, database),
    ).toContain("return_quarantine");
    expect(
      sql(`SELECT status FROM ops_return_lines WHERE id='${line}';`, database),
    ).toContain("damaged");
  });
  it("keeps a late cancellation dispatched with an exception", () => {
    const result = object(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_reconcile_cancellation('${workspace}','${orderId}','CANCELED'); COMMIT;`,
        database,
      ),
    );
    expect(result.exception).toBe("cancel_after_handover");
    expect(
      sql(`SELECT status FROM ops_orders WHERE id='${orderId}';`, database),
    ).toContain("dispatched");
  });
});
