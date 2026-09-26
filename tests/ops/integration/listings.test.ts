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
const userId = "a0000000-0000-4000-8000-000000000801";
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
const quote = (value: unknown) => JSON.stringify(value).replaceAll("'", "''");
const facts = {
  brand: "Levi's",
  model: null,
  category: "jeans",
  size: "W30",
  colour: "blue",
  material: "cotton",
  condition: "good",
  measurements: [{ label: "waist", value: 76, unit: "cm" }],
  defects: ["small scuff at hem"],
};

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
  ])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspaceId = asUser(
    `SELECT ops_bootstrap_workspace('Listing test','${key(800)}');`,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
  itemId = object(
    asUser(
      `SELECT ops_create_item('${workspaceId}',NULL,NULL,NULL,'${key(801)}');`,
    ),
  ).itemId;
  const session = object(
    asUser(
      `SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(802)}');`,
    ),
  );
  const sha = "a".repeat(64);
  assetId = object(
    asUser(
      `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','[{"clientFileId":"photo","name":"jeans.jpg","mime":"image/jpeg","bytes":1,"sha256":"${sha}"}]'::jsonb,'${key(803)}');`,
    ),
  ).uploads[0].uploadId;
  asService(
    `SELECT ops_complete_upload('${workspaceId}','${assetId}','${sha}',1,'image/jpeg','${workspaceId}/${itemId}/${assetId}.webp');`,
  );
  asUser(
    `SELECT ops_finish_capture('${workspaceId}','${session.sessionId}','${key(804)}');`,
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

function confirm(values: unknown, expected: number, n: number) {
  return object(
    asUser(
      `SELECT ops_confirm_facts('${workspaceId}','${itemId}',${expected},'${quote(values)}'::jsonb,'${key(n)}');`,
    ),
  );
}
function save(
  factRevision: number,
  listingVersion: number,
  n: number,
  title = "Levi's jeans W30",
  description = "Cotton jeans; small scuff at hem",
) {
  return object(
    asService(
      `SELECT ops_save_listing_draft_service('${workspaceId}','${userId}','${itemId}',${factRevision},${listingVersion},1,'nl',2499,'EUR',NULL,'${title.replaceAll("'", "''")}','${description.replaceAll("'", "''")}','${key(n)}');`,
    ),
  );
}
function approve(
  listingId: string,
  revisionId: string,
  version: number,
  n: number,
) {
  return object(
    asUser(
      `SELECT ops_approve_listing('${workspaceId}','${listingId}','${revisionId}',${version},'${key(n)}');`,
    ),
  );
}

describe("T08 confirmed listing revisions", () => {
  it("rejects approval until required human facts exist", () => {
    expect(() => save(0, 0, 805)).toThrow();
    const confirmed = confirm({ ...facts, condition: null }, 0, 806);
    expect(confirmed.factRevision).toBe(1);
    const draft = save(1, 0, 807);
    expect(() =>
      approve(draft.listingId, draft.revisionId, draft.version, 808),
    ).toThrow();
  });
  it("preserves an immutable approved snapshot and invalidates it after fact changes", () => {
    expect(() => confirm(facts, 0, 809)).toThrow();
    const confirmed = confirm(facts, 1, 810);
    const draft = save(confirmed.factRevision, 2, 811);
    const approved = approve(
      draft.listingId,
      draft.revisionId,
      draft.version,
      812,
    );
    expect(approved.status).toBe("ready");
    expect(() =>
      approve(draft.listingId, draft.revisionId, approved.version, 815),
    ).toThrow();
    expect(confirm(facts, 2, 816)).toMatchObject({
      factRevision: 2,
      unchanged: true,
    });
    expect(
      sql(
        `SELECT facts->>'size' FROM ops_listing_revisions WHERE id='${approved.revisionId}';`,
        database,
      ),
    ).toBe("W30");
    confirm({ ...facts, size: "W31" }, 2, 813);
    expect(
      sql(
        `SELECT status FROM ops_listings WHERE id='${approved.listingId}';`,
        database,
      ),
    ).toBe("draft");
    expect(() =>
      approve(draft.listingId, draft.revisionId, approved.version + 1, 814),
    ).toThrow();
    expect(
      sql(
        `SELECT facts->>'size' FROM ops_listing_revisions WHERE id='${approved.revisionId}';`,
        database,
      ),
    ).toBe("W30");
  });
  it("versions template changes without rewriting saved copy", () => {
    const before = sql(
      "SELECT description FROM ops_listing_revisions ORDER BY created_at LIMIT 1;",
      database,
    );
    const template = object(
      asUser(
        `SELECT ops_save_listing_template('${workspaceId}','nl','Opening','Closing',0,'${key(817)}');`,
      ),
    );
    expect(template.version).toBe(1);
    expect(() =>
      asUser(
        `SELECT ops_save_listing_template('${workspaceId}','nl','Other','Closing',0,'${key(818)}');`,
      ),
    ).toThrow();
    expect(
      sql(
        "SELECT description FROM ops_listing_revisions ORDER BY created_at LIMIT 1;",
        database,
      ),
    ).toBe(before);
  });
});
