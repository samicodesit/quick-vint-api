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
const userId = "a0000000-0000-4000-8000-000000000111";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asUser = (statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; ${statement} COMMIT;`,
    database,
  );
const object = (output: string) =>
  JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith("{"))!);

function stage(
  n: number,
  rows: Array<{
    mapped: Record<string, unknown>;
    status?: string;
    reason?: string;
  }>,
) {
  const file = sql(
    `INSERT INTO ops_import_files(workspace_id,sha256,original_name,raw_csv,headers,row_count,uploaded_by) VALUES('${workspaceId}','${n.toString(16).padStart(64, "0")}','test.csv','raw','["SKU"]'::jsonb,${rows.length},'${userId}') RETURNING id;`,
    database,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
  const run = sql(
    `INSERT INTO ops_import_runs(workspace_id,file_id,mapping,mapping_hash,account_scope,created_by) VALUES('${workspaceId}','${file}','{}'::jsonb,'${n.toString(16).padStart(64, "0")}','manual','${userId}') RETURNING id;`,
    database,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
  for (const [index, row] of rows.entries()) {
    const mapped = JSON.stringify(row.mapped).replaceAll("'", "''");
    sql(
      `INSERT INTO ops_import_rows(workspace_id,import_id,row_number,raw_values,mapped_values,status,reason) VALUES('${workspaceId}','${run}',${index + 1},'{}'::jsonb,'${mapped}'::jsonb,'${row.status ?? "pending"}',${row.reason ? `'${row.reason}'` : "NULL"});`,
      database,
    );
  }
  return { file, run };
}

beforeAll(() => {
  database = createTestDatabase();
  for (const name of ["core", "inventory", "locations", "media", "imports"])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspaceId = asUser(
    `SELECT ops_bootstrap_workspace('Imports','${key(110)}');`,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("T06 incremental import persistence", () => {
  it("matches exact external IDs, replays files safely and preserves changed cost", () => {
    const first = stage(1, [
      {
        mapped: {
          sku: "EX-1",
          externalId: "listing-7",
          title: "Blue jacket",
          costMinor: 0,
          currency: "EUR",
        },
      },
    ]);
    const applied = object(
      asUser(
        `SELECT ops_apply_import_batch('${workspaceId}','${first.run}','${key(111)}',100);`,
      ),
    );
    expect(applied).toMatchObject({
      processed: 1,
      remaining: 0,
      status: "complete",
    });
    expect(
      object(
        asUser(
          `SELECT ops_apply_import_batch('${workspaceId}','${first.run}','${key(111)}',100);`,
        ),
      ),
    ).toEqual(applied);
    expect(
      object(
        asUser(
          `SELECT ops_apply_import_batch('${workspaceId}','${first.run}','${key(112)}',100);`,
        ),
      ).processed,
    ).toBe(0);
    const itemId = sql(
      `SELECT item_id FROM ops_import_rows WHERE import_id='${first.run}';`,
      database,
    );
    expect(
      sql(`SELECT cost_minor FROM ops_items WHERE id='${itemId}';`, database),
    ).toBe("0");
    const second = stage(2, [
      {
        mapped: {
          externalId: "listing-7",
          title: "Blue jacket",
          costMinor: 0,
          currency: "EUR",
        },
      },
    ]);
    object(
      asUser(
        `SELECT ops_apply_import_batch('${workspaceId}','${second.run}','${key(113)}',100);`,
      ),
    );
    expect(
      sql(
        `SELECT item_id FROM ops_import_rows WHERE import_id='${second.run}';`,
        database,
      ),
    ).toBe(itemId);
    sql(`UPDATE ops_items SET cost_minor=500 WHERE id='${itemId}';`, database);
    const third = stage(3, [
      {
        mapped: {
          externalId: "listing-7",
          title: "Blue jacket",
          costMinor: 0,
          currency: "EUR",
        },
      },
    ]);
    object(
      asUser(
        `SELECT ops_apply_import_batch('${workspaceId}','${third.run}','${key(114)}',100);`,
      ),
    );
    expect(
      sql(
        `SELECT status FROM ops_import_rows WHERE import_id='${third.run}';`,
        database,
      ),
    ).toBe("conflicted");
    expect(
      sql(`SELECT cost_minor FROM ops_items WHERE id='${itemId}';`, database),
    ).toBe("500");
    expect(
      sql(
        `SELECT count(*) FROM ops_items WHERE workspace_id='${workspaceId}';`,
        database,
      ),
    ).toBe("1");
    sql(
      `UPDATE ops_items SET cost_minor=NULL,cost_currency=NULL WHERE id='${itemId}'; INSERT INTO ops_cost_corrections(workspace_id,item_id,actor_user_id,previous_minor,previous_currency,new_minor,new_currency,reason,item_version) VALUES('${workspaceId}','${itemId}','${userId}',500,'EUR',NULL,NULL,'Human cleared cost',3);`,
      database,
    );
    const cleared = stage(6, [
      { mapped: { externalId: "listing-7", costMinor: 0, currency: "EUR" } },
    ]);
    object(
      asUser(
        `SELECT ops_apply_import_batch('${workspaceId}','${cleared.run}','${key(117)}',100);`,
      ),
    );
    expect(
      sql(
        `SELECT status FROM ops_import_rows WHERE import_id='${cleared.run}';`,
        database,
      ),
    ).toBe("conflicted");
    expect(
      sql(
        `SELECT cost_minor IS NULL FROM ops_items WHERE id='${itemId}';`,
        database,
      ),
    ).toBe("t");
  });
  it("flags conflicting exact identities in dry-run preview", () => {
    const secondItem = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}','OTHER',NULL,NULL,'${key(115)}');`,
      ),
    ).itemId;
    const mismatch = stage(4, [
      { mapped: { sku: "OTHER", externalId: "listing-7", title: "Conflict" } },
    ]);
    object(
      asUser(
        `SELECT ops_preview_import_matches('${workspaceId}','${mismatch.run}');`,
      ),
    );
    expect(
      sql(
        `SELECT status FROM ops_import_rows WHERE import_id='${mismatch.run}';`,
        database,
      ),
    ).toBe("conflicted");
    const firstItem = sql(
      `SELECT item_id FROM ops_import_external_links WHERE workspace_id='${workspaceId}' AND external_id='listing-7';`,
      database,
    );
    expect(firstItem).not.toBe(secondItem);
  });
  it("resumes a 4,000-row stock file with no required cost or location", async () => {
    const file = sql(
      `INSERT INTO ops_import_files(workspace_id,sha256,original_name,raw_csv,headers,row_count,uploaded_by) VALUES('${workspaceId}','${"f".repeat(64)}','large.csv','fixture','["SKU"]'::jsonb,4000,'${userId}') RETURNING id;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    const run = sql(
      `INSERT INTO ops_import_runs(workspace_id,file_id,mapping,mapping_hash,account_scope,created_by) VALUES('${workspaceId}','${file}','{}'::jsonb,'${"f".repeat(64)}','manual','${userId}') RETURNING id;`,
      database,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    sql(
      `INSERT INTO ops_import_rows(workspace_id,import_id,row_number,raw_values,mapped_values,status) SELECT '${workspaceId}','${run}',n,jsonb_build_object('SKU','B-'||n),jsonb_build_object('sku','B-'||n,'title','Item '||n),'pending' FROM generate_series(1,4000) n;`,
      database,
    );
    const first = object(
      asUser(
        `SELECT ops_apply_import_batch('${workspaceId}','${run}','${key(116)}',100);`,
      ),
    );
    expect(first).toMatchObject({
      processed: 100,
      remaining: 3900,
      status: "applying",
    });
    await sqlAsync(
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; DO $$ DECLARE n integer; BEGIN FOR n IN 1..39 LOOP PERFORM ops_apply_import_batch('${workspaceId}','${run}',gen_random_uuid(),100); END LOOP; END $$; COMMIT;`,
      database,
    );
    expect(
      sql(`SELECT status FROM ops_import_runs WHERE id='${run}';`, database),
    ).toBe("complete");
    expect(
      sql(
        `SELECT count(*) FROM ops_import_rows WHERE import_id='${run}' AND status='imported';`,
        database,
      ),
    ).toBe("4000");
    expect(
      sql(
        `SELECT count(*) FROM ops_items WHERE workspace_id='${workspaceId}' AND normalized_sku LIKE 'B-%';`,
        database,
      ),
    ).toBe("4000");
  }, 120_000);
});
