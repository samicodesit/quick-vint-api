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
const userId = "a0000000-0000-4000-8000-000000000081";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asUser = (statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${userId}'; ${statement} COMMIT;`,
    database,
  );
const object = (output: string) =>
  JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith("{"))!);
const sha = "a".repeat(64);
const files = (id = "phone-1", bytes = 100) =>
  JSON.stringify([
    {
      clientFileId: id,
      name: "photo.jpg",
      mime: "image/jpeg",
      bytes,
      sha256: sha,
    },
  ]).replaceAll("'", "''");

beforeAll(() => {
  database = createTestDatabase();
  for (const name of ["core", "inventory", "locations", "media"])
    applyMigration(database, `migrations/2026-09-26_ops_${name}.sql`);
  workspaceId = asUser(
    `SELECT ops_bootstrap_workspace('Media', '${key(80)}');`,
  ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
  itemId = object(
    asUser(
      `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key(81)}');`,
    ),
  ).itemId;
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});

describe("T05 durable capture metadata", () => {
  it("binds a session and late upload permanently to its item", () => {
    const session = object(
      asUser(
        `SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(82)}');`,
      ),
    );
    expect(
      object(
        asUser(
          `SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(82)}');`,
        ),
      ),
    ).toEqual(session);
    const manifest = object(
      asUser(
        `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','${files()}'::jsonb,'${key(83)}');`,
      ),
    );
    expect(
      object(
        asUser(
          `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','${files()}'::jsonb,'${key(83)}');`,
        ),
      ),
    ).toEqual(manifest);
    const nextItem = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key(84)}');`,
      ),
    ).itemId;
    object(
      asUser(
        `SELECT ops_create_capture_session('${workspaceId}','${nextItem}','${key(85)}');`,
      ),
    );
    expect(
      object(
        asUser(
          `SELECT ops_finish_capture('${workspaceId}','${session.sessionId}','${key(86)}');`,
        ),
      ).pendingUploads,
    ).toBe(1);
    const uploadId = manifest.uploads[0].uploadId;
    const derivative = `${workspaceId}/${itemId}/${uploadId}.webp`;
    expect(
      object(
        sql(
          `BEGIN; SET LOCAL ROLE service_role; SELECT ops_complete_upload('${workspaceId}','${uploadId}','${sha}',100,'image/jpeg','${derivative}'); COMMIT;`,
          database,
        ),
      ).itemId,
    ).toBe(itemId);
    expect(
      object(
        sql(
          `BEGIN; SET LOCAL ROLE service_role; SELECT ops_complete_upload('${workspaceId}','${uploadId}','${sha}',100,'image/jpeg','${derivative}'); COMMIT;`,
          database,
        ),
      ).state,
    ).toBe("available");
    expect(
      sql(
        `SELECT item_id FROM ops_media_assets WHERE id='${uploadId}';`,
        database,
      ),
    ).toBe(itemId);
    expect(() =>
      asUser(
        `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','${files("late")}'::jsonb,'${key(87)}');`,
      ),
    ).toThrow();
    expect(() =>
      asUser(
        `SELECT ops_complete_upload('${workspaceId}','${uploadId}','${sha}',100,'image/jpeg','${derivative}');`,
      ),
    ).toThrow();
  });

  it("rejects wrong-workspace sessions, photo limit, size and quota", () => {
    const other = asUser(
      `SELECT ops_bootstrap_workspace('Other Media', '${key(88)}');`,
    ).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
    expect(() =>
      asUser(
        `SELECT ops_create_capture_session('${other}','${itemId}','${key(89)}');`,
      ),
    ).toThrow();
    const session = object(
      asUser(
        `SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(90)}');`,
      ),
    );
    expect(() =>
      asUser(
        `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','${files("huge", 20971521)}'::jsonb,'${key(91)}');`,
      ),
    ).toThrow();
    sql(
      `INSERT INTO ops_media_quotas(workspace_id,max_bytes) VALUES('${workspaceId}',150);`,
      database,
    );
    expect(() =>
      asUser(
        `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','${files("quota", 151)}'::jsonb,'${key(92)}');`,
      ),
    ).toThrow();
  });

  it("uses a single-use, expiring and upload-only phone pairing", () => {
    const session = object(
      asUser(
        `SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(93)}');`,
      ),
    );
    const tokenHash = "b".repeat(64);
    const grantHash = "c".repeat(64);
    asUser(
      `SELECT ops_create_capture_pairing('${workspaceId}','${session.sessionId}','${tokenHash}',now()+interval '5 minutes');`,
    );
    expect(() =>
      asUser(
        `SELECT ops_redeem_capture_pairing('${tokenHash}','${grantHash}');`,
      ),
    ).toThrow();
    const paired = object(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_redeem_capture_pairing('${tokenHash}','${grantHash}'); COMMIT;`,
        database,
      ),
    );
    expect(paired).toMatchObject({ workspaceId, itemId, scope: "upload" });
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_redeem_capture_pairing('${tokenHash}','${"d".repeat(64)}'); COMMIT;`,
        database,
      ),
    ).toThrow();
    expect(
      object(
        sql(
          `BEGIN; SET LOCAL ROLE service_role; SELECT ops_pairing_upload_manifest('${grantHash}','${files("paired", 1)}'::jsonb,'${key(94)}'); COMMIT;`,
          database,
        ),
      ).itemId,
    ).toBe(itemId);
    expect(() =>
      asUser(
        `SELECT ops_finish_capture('${workspaceId}','${session.sessionId}','${key(95)}');`,
      ),
    ).not.toThrow();
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_pairing_upload_manifest('${grantHash}','${files("closed", 1)}'::jsonb,'${key(96)}'); COMMIT;`,
        database,
      ),
    ).toThrow();
    const expired = "e".repeat(64);
    asUser(
      `SELECT ops_create_capture_pairing('${workspaceId}','${object(asUser(`SELECT ops_create_capture_session('${workspaceId}','${itemId}','${key(97)}');`)).sessionId}','${expired}',now()+interval '1 second');`,
    );
    sql(
      `UPDATE ops_capture_pairings SET expires_at=now()-interval '1 second' WHERE token_hash='${expired}';`,
      database,
    );
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_redeem_capture_pairing('${expired}','${"f".repeat(64)}'); COMMIT;`,
        database,
      ),
    ).toThrow();
  });

  it("reorders verified photos and retires a retake without losing original metadata", () => {
    const newItem = object(
      asUser(
        `SELECT ops_create_item('${workspaceId}', NULL, NULL, NULL, '${key(98)}');`,
      ),
    ).itemId;
    const session = object(
      asUser(
        `SELECT ops_create_capture_session('${workspaceId}','${newItem}','${key(99)}');`,
      ),
    );
    const payload = JSON.stringify([
      {
        clientFileId: "first",
        name: "first.jpg",
        mime: "image/jpeg",
        bytes: 1,
        sha256: sha,
      },
      {
        clientFileId: "second",
        name: "second.jpg",
        mime: "image/jpeg",
        bytes: 1,
        sha256: sha,
      },
    ]);
    const manifest = object(
      asUser(
        `SELECT ops_create_upload_manifest('${workspaceId}','${session.sessionId}','${payload}'::jsonb,'${key(100)}');`,
      ),
    );
    const [first, second] = manifest.uploads.map(
      (row: { uploadId: string }) => row.uploadId,
    );
    for (const uploadId of [first, second])
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_complete_upload('${workspaceId}','${uploadId}','${sha}',1,'image/jpeg','${workspaceId}/${newItem}/${uploadId}.webp'); COMMIT;`,
        database,
      );
    object(
      asUser(
        `SELECT ops_reorder_media('${workspaceId}','${newItem}',ARRAY['${second}'::uuid,'${first}'::uuid],'${key(101)}');`,
      ),
    );
    expect(
      sql(
        `SELECT string_agg(id::text,',' ORDER BY position) FROM ops_media_assets WHERE item_id='${newItem}';`,
        database,
      ),
    ).toBe(`${second},${first}`);
    object(
      asUser(
        `SELECT ops_retire_media('${workspaceId}','${first}','${key(102)}');`,
      ),
    );
    expect(
      sql(
        `SELECT state||':'||(verified_sha256 IS NOT NULL)::text FROM ops_media_assets WHERE id='${first}';`,
        database,
      ),
    ).toBe("retired:true");
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_complete_upload('${workspaceId}','${first}','${sha}',1,'image/jpeg','path'); COMMIT;`,
        database,
      ),
    ).toThrow();
  });
});
