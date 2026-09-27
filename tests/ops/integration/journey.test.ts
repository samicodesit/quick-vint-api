import { afterAll, beforeAll, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";

let database: string;
const user = "a0000000-0000-4000-8000-000000001801";
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
const asService = (statement: string) =>
  sql(`BEGIN; SET LOCAL ROLE service_role; ${statement} COMMIT;`, database);
const quote = (value: unknown) => JSON.stringify(value).replace(/'/g, "''");
beforeAll(() => {
  database = createTestDatabase();
  for (const name of [
    "core",
    "inventory",
    "locations",
    "media",
    "imports",
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
    "admin",
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

it("persists import, human listing, bundle fulfillment and same-ID return to relist", () => {
  const workspace = uuid(
    asUser(`SELECT ops_bootstrap_workspace('Journey fixture','${key(1800)}');`),
  );
  const file = uuid(
    sql(
      `INSERT INTO ops_import_files(workspace_id,sha256,original_name,raw_csv,headers,row_count,uploaded_by) VALUES('${workspace}','${"a".repeat(64)}','stock.csv','SKU,title,cost\nCSV-1,Blue coat,12','["SKU","title","cost"]'::jsonb,1,'${user}') RETURNING id;`,
      database,
    ),
  );
  const run = uuid(
    sql(
      `INSERT INTO ops_import_runs(workspace_id,file_id,mapping,mapping_hash,account_scope,created_by) VALUES('${workspace}','${file}','{}'::jsonb,'${"b".repeat(64)}','manual','${user}') RETURNING id;`,
      database,
    ),
  );
  sql(
    `INSERT INTO ops_import_rows(workspace_id,import_id,row_number,raw_values,mapped_values,status) VALUES('${workspace}','${run}',1,'{"SKU":"CSV-1"}'::jsonb,'{"sku":"CSV-1","title":"Blue coat","costMinor":1200,"currency":"EUR"}'::jsonb,'pending');`,
    database,
  );
  expect(
    object(
      asUser(
        `SELECT ops_apply_import_batch('${workspace}','${run}','${key(1801)}',100);`,
      ),
    ).processed,
  ).toBe(1);
  const first = uuid(
    sql(
      `SELECT item_id FROM ops_import_rows WHERE import_id='${run}';`,
      database,
    ),
  );
  const second = object(
    asUser(
      `SELECT ops_create_item('${workspace}','MANUAL-2',NULL,NULL,'${key(1802)}');`,
    ),
  ).itemId;
  const capture = object(
    asUser(
      `SELECT ops_create_capture_session('${workspace}','${first}','${key(1803)}');`,
    ),
  );
  const asset = object(
    asUser(
      `SELECT ops_create_upload_manifest('${workspace}','${capture.sessionId}','[{"clientFileId":"front","name":"coat.jpg","mime":"image/jpeg","bytes":1,"sha256":"${"c".repeat(64)}"}]'::jsonb,'${key(1804)}');`,
    ),
  ).uploads[0].uploadId;
  asService(
    `SELECT ops_complete_upload('${workspace}','${asset}','${"c".repeat(64)}',1,'image/jpeg','${workspace}/${first}/${asset}.webp');`,
  );
  asUser(
    `SELECT ops_finish_capture('${workspace}','${capture.sessionId}','${key(1805)}');`,
  );
  const facts = {
    brand: "Vintage",
    model: null,
    category: "coat",
    size: "M",
    colour: "blue",
    material: "cotton",
    condition: "good",
    measurements: [],
    defects: [],
  };
  expect(
    object(
      asUser(
        `SELECT ops_confirm_facts('${workspace}','${first}',0,'${quote(facts)}'::jsonb,'${key(1806)}');`,
      ),
    ).factRevision,
  ).toBe(1);
  const draft = object(
    asService(
      `SELECT ops_save_listing_draft_service('${workspace}','${user}','${first}',1,0,1,'en',6000,'EUR',NULL,'Blue cotton coat','Vintage blue cotton coat','${key(1807)}');`,
    ),
  );
  const approved = object(
    asUser(
      `SELECT ops_approve_listing('${workspace}','${draft.listingId}','${draft.revisionId}',${draft.version},'${key(1808)}');`,
    ),
  );
  expect(approved.status).toBe("ready");
  expect(
    object(
      asUser(
        `SELECT ops_list_inventory('${workspace}','CSV-1',NULL,NULL,NULL,NULL,NULL,10);`,
      ),
    ).items[0].shortTitle,
  ).toBe("Blue cotton coat");
  const handoff = object(
    asUser(
      `SELECT ops_ack_handoff('${workspace}','${first}','${draft.listingId}','${draft.revisionId}','${key(1809)}','prepared','manual','${key(1810)}');`,
    ),
  );
  expect(handoff.marketplaceStatus).toBe("unverified");
  const order = object(
    asUser(
      `SELECT ops_create_manual_order('${workspace}',true,'EUR',6000,'[{"itemId":"${first}","title":"Blue coat"},{"itemId":"${second}","title":"Second item"}]'::jsonb,'${key(1811)}');`,
    ),
  );
  asUser(
    `SELECT ops_reserve_order('${workspace}','${order.orderId}',1,'${key(1812)}');`,
  );
  const wave = object(
    asUser(
      `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${order.orderId}"}]'::jsonb,'${key(1813)}');`,
    ),
  );
  const tasks = sql(
    `SELECT id,item_id FROM ops_pick_tasks WHERE wave_id='${wave.waveId}';`,
    database,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  for (const [index, row] of tasks.entries()) {
    const [taskId, itemId] = row.split("|");
    const claim = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${taskId}',1,'${key(1814 + index)}');`,
      ),
    );
    asUser(
      `SELECT ops_verify_pick('${workspace}','${taskId}','${claim.claimId}','${itemId === first ? "CSV-1" : "MANUAL-2"}',NULL,'${key(1816 + index)}');`,
    );
  }
  const pack = object(
    asUser(
      `SELECT ops_start_pack('${workspace}','${order.orderId}','${key(1818)}');`,
    ),
  );
  asUser(
    `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','CSV-1','${key(1819)}');`,
  );
  asUser(
    `SELECT ops_scan_pack_item('${workspace}','${pack.sessionId}','MANUAL-2','${key(1820)}');`,
  );
  const label = uuid(
    sql(
      `INSERT INTO ops_labels(workspace_id,order_id,source,storage_path,sha256,bytes,created_by) VALUES('${workspace}','${order.orderId}','manual_upload','${workspace}/${order.orderId}/label.pdf','${"d".repeat(64)}',100,'${user}') RETURNING id;`,
      database,
    ),
  );
  asUser(
    `SELECT ops_attach_label('${workspace}','${pack.sessionId}','${label}','${key(1821)}');`,
  );
  expect(
    object(
      asUser(
        `SELECT ops_record_handover('${workspace}','${pack.shipmentId}','${key(1822)}');`,
      ),
    ).status,
  ).toBe("handed_over");
  expect(
    sql(`SELECT custody FROM ops_items WHERE id='${first}';`, database),
  ).toBe("outbound");
  const receipt = object(
    asUser(
      `SELECT ops_record_return_receipt('${workspace}','${order.orderId}','["CSV-1"]'::jsonb,'${key(1823)}');`,
    ),
  );
  const returnLine = uuid(
    sql(
      `SELECT id FROM ops_return_lines WHERE return_id='${receipt.returnId}';`,
      database,
    ),
  );
  expect(
    sql(`SELECT custody FROM ops_items WHERE id='${second}';`, database),
  ).toBe("outbound");
  asUser(
    `SELECT ops_inspect_return('${workspace}','${returnLine}','resellable','Clean','${key(1824)}');`,
  );
  const version = Number(
    sql(`SELECT version FROM ops_items WHERE id='${first}';`, database),
  );
  expect(
    object(
      asUser(
        `SELECT ops_restock_return('${workspace}','${returnLine}',NULL,${version},'${key(1825)}');`,
      ),
    ).status,
  ).toBe("restocked");
  expect(
    sql(`SELECT custody FROM ops_items WHERE id='${first}';`, database),
  ).toBe("on_hand");
  expect(
    sql(`SELECT status FROM ops_listings WHERE item_id='${first}';`, database),
  ).toBe("draft");
  const listingVersion = Number(
    sql(`SELECT version FROM ops_listings WHERE item_id='${first}';`, database),
  );
  const relist = object(
    asService(
      `SELECT ops_save_listing_draft_service('${workspace}','${user}','${first}',1,${listingVersion},1,'en',5500,'EUR',NULL,'Blue cotton coat, returned','Reinspected blue coat','${key(1826)}');`,
    ),
  );
  expect(
    object(
      asUser(
        `SELECT ops_approve_listing('${workspace}','${relist.listingId}','${relist.revisionId}',${relist.version},'${key(1827)}');`,
      ),
    ).status,
  ).toBe("ready");
  expect(
    sql(
      `SELECT count(*) FROM ops_order_lines WHERE order_id='${order.orderId}' AND item_id='${first}';`,
      database,
    ),
  ).toBe("1");
  expect(
    sql(
      `SELECT count(*) FROM ops_vinted_connections WHERE workspace_id='${workspace}';`,
      database,
    ),
  ).toBe("0");
}, 30000);
