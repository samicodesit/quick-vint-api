import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportOrder, exportTables } from "../../../utils/ops/admin/team";
import {
  applyMigration,
  createTestDatabase,
  dropTestDatabase,
  sql,
} from "./psql";
let database: string, workspace: string;
const owner = "a0000000-0000-4000-8000-000000001701",
  invitee = "a0000000-0000-4000-8000-000000001702";
const key = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uuid = (value: string) =>
  value.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)![0];
const object = (value: string) =>
  JSON.parse(value.split(/\r?\n/).find((line) => line.startsWith("{"))!);
const as = (user: string, email: string, statement: string) =>
  sql(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SET LOCAL request.jwt.claim.email='${email}'; ${statement} COMMIT;`,
    database,
  );
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
  workspace = uuid(
    as(
      owner,
      "owner@example.test",
      `SELECT ops_bootstrap_workspace('Admin test','${key(1700)}');`,
    ),
  );
});
afterAll(() => {
  if (database) dropTestDatabase(database);
});
describe("team administration", () => {
  it("lists every operational table for export with a valid stable order key", () => {
    const tables = sql(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'ops_%' ORDER BY tablename;",
      database,
    )
      .split(/\r?\n/)
      .filter(Boolean);
    expect([...exportTables].sort()).toEqual(tables);
    const expected = exportTables
      .flatMap((table) =>
        (exportOrder[table] ?? ["id"]).map(
          (column) => `('${table}','${column}')`,
        ),
      )
      .join(",");
    const missing = sql(
      `SELECT e.table_name||'.'||e.column_name FROM (VALUES ${expected}) AS e(table_name,column_name) LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name WHERE c.column_name IS NULL;`,
      database,
    );
    expect(missing).toBe("");
  });
  it("accepts an email-matched invite once and refuses replay", () => {
    const invite = object(
      as(
        owner,
        "owner@example.test",
        `SELECT ops_invite_create('${workspace}','new@example.test','manager','${key(1701)}');`,
      ),
    );
    expect(() =>
      as(
        invitee,
        "other@example.test",
        `SELECT ops_invite_accept('${invite.token}','${key(1702)}');`,
      ),
    ).toThrow();
    expect(
      object(
        as(
          invitee,
          "new@example.test",
          `SELECT ops_invite_accept('${invite.token}','${key(1703)}');`,
        ),
      ).role,
    ).toBe("manager");
    expect(() =>
      as(
        invitee,
        "new@example.test",
        `SELECT ops_invite_accept('${invite.token}','${key(1703)}');`,
      ),
    ).toThrow();
    expect(
      sql(
        `SELECT role FROM ops_memberships WHERE workspace_id='${workspace}' AND user_id='${invitee}';`,
        database,
      ),
    ).toContain("manager");
  });
  it("rejects expiry and preserves the last owner", () => {
    const invite = object(
      as(
        owner,
        "owner@example.test",
        `SELECT ops_invite_create('${workspace}','late@example.test','warehouse','${key(1704)}');`,
      ),
    );
    sql(
      `UPDATE ops_invitations SET expires_at=now()-interval '1 minute' WHERE id='${invite.inviteId}';`,
      database,
    );
    expect(() =>
      as(
        invitee,
        "late@example.test",
        `SELECT ops_invite_accept('${invite.token}','${key(1705)}');`,
      ),
    ).toThrow();
    expect(() =>
      as(
        owner,
        "owner@example.test",
        `SELECT ops_member_update('${workspace}','${owner}','manager',true,'${key(1706)}');`,
      ),
    ).toThrow();
    expect(() =>
      as(
        owner,
        "owner@example.test",
        `SELECT ops_member_update('${workspace}','${owner}','owner',false,'${key(1707)}');`,
      ),
    ).toThrow();
  });
  it("revokes access before the next request and records settings and deletion request", () => {
    expect(
      object(
        as(
          owner,
          "owner@example.test",
          `SELECT ops_member_update('${workspace}','${invitee}','manager',false,'${key(1708)}');`,
        ),
      ).active,
    ).toBe(false);
    expect(() =>
      as(
        invitee,
        "new@example.test",
        `SELECT ops_settings_update('${workspace}',0,'EUR',365,'${key(1709)}');`,
      ),
    ).toThrow();
    expect(
      object(
        as(
          owner,
          "owner@example.test",
          `SELECT ops_settings_update('${workspace}',500,'EUR',365,'${key(1710)}');`,
        ),
      ).saved,
    ).toBe(true);
    expect(
      object(
        as(
          owner,
          "owner@example.test",
          `SELECT ops_request_workspace_deletion('${workspace}','${key(1711)}');`,
        ),
      ).status,
    ).toBe("pending_review");
  });
  it("retention candidates stay within one workspace and leave active media untouched", () => {
    const other = uuid(
      as(
        owner,
        "owner@example.test",
        `SELECT ops_bootstrap_workspace('Other retention','${key(1713)}');`,
      ),
    );
    as(
      owner,
      "owner@example.test",
      `SELECT ops_settings_update('${other}',0,'EUR',365,'${key(1714)}');`,
    );
    for (const [scope, index] of [
      [workspace, 0],
      [other, 1],
    ] as const) {
      const item = object(
        as(
          owner,
          "owner@example.test",
          `SELECT ops_create_item('${scope}','RET-${index}',NULL,NULL,'${key(1715 + index)}');`,
        ),
      ).itemId;
      const session = object(
        as(
          owner,
          "owner@example.test",
          `SELECT ops_create_capture_session('${scope}','${item}','${key(1717 + index)}');`,
        ),
      ).sessionId;
      sql(
        `INSERT INTO ops_media_assets(id,workspace_id,item_id,session_id,client_file_id,original_name,declared_mime,declared_bytes,declared_sha256,original_path,position,state,creator_user_id,created_at) VALUES('${key(1720 + index)}','${scope}','${item}','${session}','file-${index}','photo.jpg','image/jpeg',100,'${"a".repeat(64)}','${scope}/${item}/${key(1720 + index)}',0,'retired','${owner}',now()-interval '400 days');`,
        database,
      );
    }
    const candidates = JSON.parse(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_retention_candidates('${workspace}',100); COMMIT;`,
        database,
      )
        .split(/\r?\n/)
        .find((line) => line.startsWith("["))!,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].originalPath.startsWith(`${workspace}/`)).toBe(true);
    sql(
      `BEGIN; SET LOCAL ROLE service_role; SELECT ops_mark_media_purged('${workspace}','${key(1720)}'); COMMIT;`,
      database,
    );
    expect(
      sql(
        `SELECT purged_at IS NULL FROM ops_media_assets WHERE id='${key(1721)}';`,
        database,
      ),
    ).toBe("t");
  });
  it("exports tenant records with invite tokens and command results redacted", () => {
    const exported = JSON.parse(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_export_workspace_table('${workspace}','ops_invitations',0); COMMIT;`,
        database,
      )
        .split(/\r?\n/)
        .find((line) => line.startsWith("["))!,
    );
    expect(exported.length).toBeGreaterThan(0);
    expect(exported[0].token_hash).toBeUndefined();
    const commands = JSON.parse(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_export_workspace_table('${workspace}','ops_command_results',0); COMMIT;`,
        database,
      )
        .split(/\r?\n/)
        .find((line) => line.startsWith("["))!,
    );
    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0].result).toBeUndefined();
    const accountRows = JSON.parse(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_export_user_table('${owner}','ops_invitations',0); COMMIT;`,
        database,
      )
        .split(/\r?\n/)
        .find((line) => line.startsWith("["))!,
    );
    expect(accountRows.length).toBeGreaterThan(0);
    expect(accountRows[0].token_hash).toBeUndefined();
  });
  it("stores credentials behind owner RPC with replay-safe secret identity", () => {
    const command = `SELECT ops_store_credential('${workspace}','vinted_pro','v1:cipher-one',1,'${"a".repeat(64)}','${key(1730)}');`;
    expect(object(as(owner, "owner@example.test", command)).stored).toBe(true);
    expect(
      object(
        as(
          owner,
          "owner@example.test",
          `SELECT ops_store_credential('${workspace}','vinted_pro','v1:cipher-two',1,'${"a".repeat(64)}','${key(1730)}');`,
        ),
      ).stored,
    ).toBe(true);
    expect(
      sql(
        `SELECT ciphertext FROM ops_credentials WHERE workspace_id='${workspace}';`,
        database,
      ),
    ).toBe("v1:cipher-one");
    expect(() =>
      as(
        invitee,
        "new@example.test",
        `SELECT ops_store_credential('${workspace}','resend','v1:cipher',1,'${"b".repeat(64)}','${key(1731)}');`,
      ),
    ).toThrow();
  });
  it("requires review and deletes only the selected workspace", () => {
    const other = uuid(
      as(
        owner,
        "owner@example.test",
        `SELECT ops_bootstrap_workspace('Keep me','${key(1712)}');`,
      ),
    );
    const requestId = uuid(
      sql(
        `SELECT id FROM ops_workspace_deletion_requests WHERE workspace_id='${workspace}';`,
        database,
      ),
    );
    expect(() =>
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_execute_workspace_deletion('${workspace}','${requestId}'); COMMIT;`,
        database,
      ),
    ).toThrow();
    sql(
      `UPDATE ops_workspace_deletion_requests SET status='approved',reviewed_by='${owner}',reviewed_at=now() WHERE id='${requestId}';`,
      database,
    );
    const result = object(
      sql(
        `BEGIN; SET LOCAL ROLE service_role; SELECT ops_execute_workspace_deletion('${workspace}','${requestId}'); COMMIT;`,
        database,
      ),
    );
    expect(result.deleted).toBe(true);
    expect(
      sql(
        `SELECT count(*) FROM ops_workspaces WHERE id='${workspace}';`,
        database,
      ),
    ).toBe("0");
    expect(
      sql(`SELECT count(*) FROM ops_workspaces WHERE id='${other}';`, database),
    ).toBe("1");
    expect(
      sql(
        `SELECT count(*) FROM ops_deletion_tombstones WHERE workspace_id='${workspace}';`,
        database,
      ),
    ).toBe("1");
  });
});
