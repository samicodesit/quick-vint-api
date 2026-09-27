import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";
let database: string;
let workspace: string;
const user = "a0000000-0000-4000-8000-000000001201";
const secondUser = "a0000000-0000-4000-8000-000000001202";
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
const asSecond = (statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${secondUser}'; ${statement} COMMIT;`,
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
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspace = uuid(
    asUser(`SELECT ops_bootstrap_workspace('Pick test','${key(1200)}');`),
  );
  sql(
    `INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES('${workspace}','${secondUser}','warehouse');`,
    database,
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});
function newOrder(n: number) {
  const item = object(
    asUser(
      `SELECT ops_create_item('${workspace}','SKU-${n}',NULL,NULL,'${key(n)}');`,
    ),
  ).itemId;
  const order = object(
    asUser(
      `SELECT ops_create_manual_order('${workspace}',true,NULL,NULL,'[{"itemId":"${item}","title":"Garment"}]'::jsonb,'${key(n + 100)}');`,
    ),
  );
  asUser(
    `SELECT ops_reserve_order('${workspace}','${order.orderId}',1,'${key(n + 200)}');`,
  );
  return { item, orderId: order.orderId, code: `SKU-${n}` };
}
describe("pick waves", () => {
  it("requires the correct item and tote before persisting a pick", () => {
    const first = newOrder(1201),
      second = newOrder(1202);
    const wave = object(
      asUser(
        `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${first.orderId}","toteCode":"T-1"},{"orderId":"${second.orderId}","toteCode":"T-2"}]'::jsonb,'${key(1203)}');`,
      ),
    );
    expect(wave.mode).toBe("batch");
    expect(wave.taskCount).toBe(2);
    const task = uuid(
      sql(
        `SELECT id FROM ops_pick_tasks WHERE wave_id='${wave.waveId}' AND order_id='${first.orderId}';`,
        database,
      ),
    );
    const claim = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${task}',1,'${key(1204)}');`,
      ),
    );
    expect(() =>
      asUser(
        `SELECT ops_verify_pick('${workspace}','${task}','${claim.claimId}','${second.code}','T-1','${key(1205)}');`,
      ),
    ).toThrow();
    expect(() =>
      asUser(
        `SELECT ops_verify_pick('${workspace}','${task}','${claim.claimId}','${first.code}','T-2','${key(1206)}');`,
      ),
    ).toThrow();
    expect(
      object(
        asUser(
          `SELECT ops_verify_pick('${workspace}','${task}','${claim.claimId}','${first.code}','T-1','${key(1207)}');`,
        ),
      ).status,
    ).toBe("picked");
    expect(
      object(
        asUser(
          `SELECT ops_verify_pick('${workspace}','${task}','${claim.claimId}','${first.code}','T-1','${key(1207)}');`,
        ),
      ).status,
    ).toBe("picked");
    expect(() =>
      asUser(
        `SELECT ops_verify_pick('${workspace}','${task}','${claim.claimId}','${first.code}','T-1','${key(1208)}');`,
      ),
    ).toThrow();
  });
  it("rejects a stale claim after cancellation and preserves a missing issue", () => {
    const first = newOrder(1210);
    const wave = object(
      asUser(
        `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${first.orderId}"}]'::jsonb,'${key(1211)}');`,
      ),
    );
    const task = uuid(
      sql(
        `SELECT id FROM ops_pick_tasks WHERE wave_id='${wave.waveId}';`,
        database,
      ),
    );
    const claim = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${task}',1,'${key(1212)}');`,
      ),
    );
    sql(
      `UPDATE ops_orders SET status='cancelled' WHERE id='${first.orderId}';`,
      database,
    );
    expect(() =>
      asUser(
        `SELECT ops_verify_pick('${workspace}','${task}','${claim.claimId}','${first.code}',NULL,'${key(1213)}');`,
      ),
    ).toThrow();
    const second = newOrder(1214);
    const another = object(
      asUser(
        `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${second.orderId}"}]'::jsonb,'${key(1215)}');`,
      ),
    );
    const task2 = uuid(
      sql(
        `SELECT id FROM ops_pick_tasks WHERE wave_id='${another.waveId}';`,
        database,
      ),
    );
    const claim2 = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${task2}',1,'${key(1216)}');`,
      ),
    );
    expect(
      object(
        asUser(
          `SELECT ops_mark_pick_missing('${workspace}','${task2}','${claim2.claimId}','Garment absent from location','${key(1217)}');`,
        ),
      ).status,
    ).toBe("missing");
    expect(
      sql(
        `SELECT count(*) FROM ops_order_issues WHERE order_id='${second.orderId}' AND kind='missing_pick';`,
        database,
      ),
    ).toMatch(/1/);
  });
  it("allows another worker to reclaim only after the lease expires", () => {
    const piece = newOrder(1220);
    const wave = object(
      asUser(
        `SELECT ops_create_pick_wave('${workspace}','[{"orderId":"${piece.orderId}"}]'::jsonb,'${key(1221)}');`,
      ),
    );
    const task = uuid(
      sql(
        `SELECT id FROM ops_pick_tasks WHERE wave_id='${wave.waveId}';`,
        database,
      ),
    );
    const first = object(
      asUser(
        `SELECT ops_claim_pick_task('${workspace}','${task}',1,'${key(1222)}');`,
      ),
    );
    expect(() =>
      asSecond(
        `SELECT ops_claim_pick_task('${workspace}','${task}',2,'${key(1223)}');`,
      ),
    ).toThrow();
    sql(
      `UPDATE ops_pick_tasks SET claim_until=now()-interval '1 second' WHERE id='${task}';`,
      database,
    );
    const second = object(
      asSecond(
        `SELECT ops_claim_pick_task('${workspace}','${task}',2,'${key(1224)}');`,
      ),
    );
    expect(second.claimId).not.toBe(first.claimId);
    expect(() =>
      asUser(
        `SELECT ops_verify_pick('${workspace}','${task}','${first.claimId}','${piece.code}',NULL,'${key(1225)}');`,
      ),
    ).toThrow();
    expect(
      object(
        asSecond(
          `SELECT ops_verify_pick('${workspace}','${task}','${second.claimId}','${piece.code}',NULL,'${key(1226)}');`,
        ),
      ).status,
    ).toBe("picked");
  });
});
