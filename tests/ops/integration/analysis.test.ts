import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";

let database: string;
let workspaceId: string;
let itemId: string;
let assetId: string;
let revision: number;
const userId = "a0000000-0000-4000-8000-000000000701";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asUser = (statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; ${statement} COMMIT;`,
    database,
  );
const asService = (statement: string) =>
  sql(`BEGIN; SET LOCAL ROLE service_role; ${statement} COMMIT;`, database);
const object = (output: string) =>
  JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith("{"))!);
const sha = "a".repeat(64);

beforeAll(() => {
  database = createTestDatabase();
  for (const name of [
    "core",
    "inventory",
    "locations",
    "media",
    "jobs",
    "analysis",
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspaceId = asUser(
    `SELECT ops_bootstrap_workspace('Analysis','${key(700)}');`,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
  itemId = object(
    asUser(
      `SELECT ops_create_item('${workspaceId}',NULL,NULL,NULL,'${key(701)}');`,
    ),
  ).itemId;
  const session = object(
    asUser(
      `SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(702)}');`,
    ),
  );
  assetId = object(
    asUser(
      `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','[{"clientFileId":"photo","name":"coat.jpg","mime":"image/jpeg","bytes":1,"sha256":"${sha}"}]'::jsonb,'${key(703)}');`,
    ),
  ).uploads[0].uploadId;
  asService(
    `SELECT ops_complete_upload('${workspaceId}','${assetId}','${sha}',1,'image/jpeg','${workspaceId}/${itemId}/${assetId}.webp');`,
  );
  asUser(
    `SELECT ops_finish_capture('${workspaceId}','${session.sessionId}','${key(704)}');`,
  );
  revision = Number(
    sql(
      `SELECT capture_revision FROM ops_items WHERE id='${itemId}';`,
      database,
    ),
  );
  sql(
    `INSERT INTO ops_ai_entitlements(workspace_id,owner_user_id,mode,monthly_result_limit,budget_minor,enabled) VALUES('${workspaceId}','${userId}','fixture',10,1000,true);`,
    database,
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

function request(mode: "initial" | "targeted", n: number) {
  return object(
    asUser(
      `SELECT ops_request_analysis('${workspaceId}','${itemId}',${revision},'${mode}','fixture-model','prompt-1','schema-1','ontology-1','${key(n)}');`,
    ),
  );
}
describe("T07 bounded analysis persistence", () => {
  it("dedupes one logical run and ignores cost or location changes", () => {
    expect(revision).toBe(2);
    const first = request("initial", 705);
    expect(request("initial", 705)).toEqual(first);
    expect(request("initial", 706).runId).toBe(first.runId);
    sql(
      `UPDATE ops_items SET cost_minor=300,cost_currency='EUR' WHERE id='${itemId}';`,
      database,
    );
    expect(request("initial", 707).runId).toBe(first.runId);
    expect(
      sql(
        `SELECT count(*) FROM ops_jobs WHERE kind='analysis.item';`,
        database,
      ),
    ).toBe("1");
    expect(
      sql(
        `SELECT count(*) FROM ops_analysis_run_assets WHERE run_id='${first.runId}';`,
        database,
      ),
    ).toBe("1");
  });
  it("validates same-item evidence and debits a completed logical result once", () => {
    const first = request("initial", 708);
    const dispatch = object(
      asService(`SELECT ops_begin_analysis_dispatch('${first.runId}',1);`),
    );
    expect(dispatch.attempt).toBe(1);
    const bad = JSON.stringify([
      {
        field: "not-a-field",
        valueText: "x",
        reason: "visible",
        evidenceAssetIds: [assetId],
      },
    ]).replaceAll("'", "''");
    expect(() =>
      asService(
        `SELECT ops_record_analysis_result('${first.runId}','${dispatch.dispatchId}','${bad}'::jsonb,'{}'::jsonb,0,NULL);`,
      ),
    ).toThrow();
    const foreign = JSON.stringify([
      {
        field: "brand",
        valueText: "x",
        reason: "visible",
        evidenceAssetIds: [key(799)],
      },
    ]).replaceAll("'", "''");
    expect(() =>
      asService(
        `SELECT ops_record_analysis_result('${first.runId}','${dispatch.dispatchId}','${foreign}'::jsonb,'{}'::jsonb,0,NULL);`,
      ),
    ).toThrow();
    const proposals = JSON.stringify([
      {
        field: "size",
        valueText: null,
        reason: "unreadable",
        evidenceAssetIds: [assetId],
      },
    ]).replaceAll("'", "''");
    expect(
      object(
        asService(
          `SELECT ops_record_analysis_result('${first.runId}','${dispatch.dispatchId}','${proposals}'::jsonb,'{"inputTokens":100,"outputTokens":20}'::jsonb,0,NULL);`,
        ),
      ).status,
    ).toBe("completed");
    expect(
      object(
        asService(
          `SELECT ops_record_analysis_result('${first.runId}','${dispatch.dispatchId}','${proposals}'::jsonb,'{}'::jsonb,0,NULL);`,
        ),
      ).status,
    ).toBe("completed");
    expect(
      sql(
        `SELECT count(*) FROM ops_usage_entries WHERE run_id='${first.runId}';`,
        database,
      ),
    ).toBe("1");
    expect(
      sql(
        `SELECT customer_debit FROM ops_usage_entries WHERE run_id='${first.runId}';`,
        database,
      ),
    ).toBe("0");
  });
  it("allows one explicit targeted pass and records uncertain billing", () => {
    const targeted = request("targeted", 709);
    expect(() => request("targeted", 710)).not.toThrow();
    const dispatch = object(
      asService(`SELECT ops_begin_analysis_dispatch('${targeted.runId}',1);`),
    );
    asService(
      `SELECT ops_finish_analysis_dispatch('${dispatch.dispatchId}','uncertain','{}'::jsonb,NULL,'TIMEOUT');`,
    );
    expect(
      sql(
        `SELECT status FROM ops_analysis_dispatches WHERE id='${dispatch.dispatchId}';`,
        database,
      ),
    ).toBe("uncertain");
    expect(
      sql(
        `SELECT reserved_minor FROM ops_ai_entitlements WHERE workspace_id='${workspaceId}';`,
        database,
      ),
    ).toBe("1");
    expect(
      sql(
        `SELECT count(*) FROM ops_usage_entries WHERE run_id='${targeted.runId}';`,
        database,
      ),
    ).toBe("0");
  });
});
