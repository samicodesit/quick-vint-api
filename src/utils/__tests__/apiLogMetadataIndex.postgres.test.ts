import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("indexes each sparse metadata selector without altering eligibility", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE api_logs (
      id integer PRIMARY KEY, created_at timestamptz NOT NULL, endpoint text,
      user_agent text, origin text, ip_address text, user_email text
    );
    CREATE INDEX api_logs_time ON api_logs (created_at DESC);
    INSERT INTO api_logs SELECT n, now() - interval '100 days' + n * interval '1 second',
      '/event/old', NULL, NULL, NULL, NULL FROM generate_series(1, 20000) n;
    INSERT INTO api_logs VALUES
      (20001, now()-interval '8 hours', '/event/copy', 'a', NULL, NULL, NULL),
      (20002, now()-interval '8 hours', '/event/copy', NULL, 'o', NULL, NULL),
      (20003, now()-interval '8 hours', '/event/copy', NULL, NULL, 'i', NULL),
      (20004, now()-interval '8 hours', '/event/copy', NULL, NULL, NULL, 'e'),
      (20005, now()-interval '1 hour', '/event/copy', 'a', 'o', 'i', 'e'),
      (20006, now()-interval '8 days', '/event/listing_report_submitted', 'a', 'o', 'i', 'e');`);
    const fields = ["user_agent", "origin", "ip_address", "user_email"];
    const selector = (field: string) => `SELECT id FROM api_logs
      WHERE (endpoint IS NULL OR endpoint <> '/event/listing_report_submitted')
      AND created_at < now() - interval '6 hours' AND ${field} IS NOT NULL
      ORDER BY created_at ASC LIMIT 500`;
    const before = await Promise.all(fields.map((f) => db.query(selector(f))));
    expect(before.map((r) => r.rows)).toEqual([
      [{ id: 20001 }],
      [{ id: 20002 }],
      [{ id: 20003 }],
      [{ id: 20004 }],
    ]);
    await db.exec(
      readFileSync(
        "migrations/2026-11-09_api_log_metadata_compaction_index.sql",
        "utf8",
      ),
    );
    const after = await Promise.all(fields.map((f) => db.query(selector(f))));
    expect(after.map((r) => r.rows)).toEqual(before.map((r) => r.rows));
    await db.exec(
      "ANALYZE api_logs; SET enable_seqscan = off; SET plan_cache_mode = force_generic_plan",
    );
    for (const field of fields) {
      await db.exec(`PREPARE select_${field}(text,timestamptz) AS
        SELECT id FROM api_logs WHERE (endpoint IS NULL OR endpoint <> $1)
        AND created_at < $2 AND ${field} IS NOT NULL ORDER BY created_at ASC LIMIT 500`);
      const plan = await db.query<{ "QUERY PLAN": string }>(
        `EXPLAIN EXECUTE select_${field}('/event/listing_report_submitted',now())`,
      );
      expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain(
        "api_logs_compaction_metadata_candidates",
      );
    }
  } finally {
    await db.close();
  }
});
