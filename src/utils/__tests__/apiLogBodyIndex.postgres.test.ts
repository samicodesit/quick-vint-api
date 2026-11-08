import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("indexes candidate bodies without changing retention selection", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE api_logs (id integer PRIMARY KEY, created_at timestamptz NOT NULL, endpoint text, full_request_body jsonb); " +
        "CREATE INDEX api_logs_time ON api_logs (created_at DESC); " +
        "INSERT INTO api_logs SELECT n, now() - interval '100 days' + n * interval '1 second', '/event/old', NULL FROM generate_series(1, 10000) n;",
    );
    const cases: Array<[number, string, string | null, object]> = [
      [10001, "8 hours", "/event/copy", { event: "copy" }],
      [10002, "1 hour", "/event/copy", { event: "copy" }],
      [
        10003,
        "1 day",
        "/event/generation_output_edited",
        { context: { textCaptureVersion: 1 } },
      ],
      [
        10004,
        "8 days",
        "/event/generation_output_edited",
        { context: { textCaptureVersion: 1 } },
      ],
      [10005, "29 days", "/event/copy", { analyticsOnly: true }],
      [10006, "31 days", "/event/copy", { analyticsOnly: true }],
      [
        10007,
        "12 hours",
        "/api/generate",
        { analyticsOnly: true, inputPhotoReview: { v: 1 } },
      ],
      [
        10008,
        "25 hours",
        "/api/generate",
        { analyticsOnly: true, inputPhotoReview: { v: 1 } },
      ],
      [10009, "8 days", "/event/listing_report_submitted", { feedback: true }],
      [10010, "8 hours", null, { event: "unknown" }],
    ];
    for (const [id, age, endpoint, body] of cases) {
      await db.query(
        "INSERT INTO api_logs VALUES ($1, now() - $2::interval, $3, $4::jsonb)",
        [id, age, endpoint, JSON.stringify(body)],
      );
    }
    const selector = [
      "SELECT id FROM api_logs",
      "WHERE (endpoint IS NULL OR endpoint <> '/event/listing_report_submitted')",
      "AND created_at < now() - interval '6 hours'",
      "AND full_request_body IS NOT NULL",
      "AND (endpoint IS NULL OR endpoint <> '/event/generation_output_edited'",
      "OR full_request_body->'context'->>'textCaptureVersion' IS NULL",
      "OR created_at < now() - interval '7 days')",
      "AND (full_request_body->>'analyticsOnly' IS NULL",
      "OR created_at < now() - interval '30 days'",
      "OR (full_request_body->'inputPhotoReview' IS NOT NULL",
      "AND created_at < now() - interval '24 hours'))",
      "ORDER BY created_at ASC LIMIT 500",
    ].join(" ");
    const before = (await db.query<{ id: number }>(selector)).rows.map(
      (r) => r.id,
    );
    expect(before.sort((a, b) => a - b)).toEqual([
      10001, 10004, 10006, 10008, 10010,
    ]);
    const migration = readFileSync(
      "migrations/2026-11-08_api_log_body_compaction_index.sql",
      "utf8",
    );
    await db.exec(migration);
    const after = (await db.query<{ id: number }>(selector)).rows.map(
      (r) => r.id,
    );
    expect(after.sort((a, b) => a - b)).toEqual(before);
    await db.exec("ANALYZE api_logs; SET enable_seqscan = off");
    const explain = await db.query<{ "QUERY PLAN": string }>(
      "EXPLAIN " + selector,
    );
    expect(explain.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain(
      "api_logs_compaction_body_candidates",
    );
    const parameterized = selector
      .replace(
        "endpoint <> '/event/listing_report_submitted'",
        "endpoint <> $1",
      )
      .replace(
        "endpoint <> '/event/generation_output_edited'",
        "endpoint <> $2",
      )
      .replace("->'context'->>'textCaptureVersion'", "->$3->>$4")
      .replace("->>'analyticsOnly'", "->>$5")
      .replace("->'inputPhotoReview'", "->$6");
    await db.exec("SET plan_cache_mode = force_generic_plan");
    await db.exec(
      "PREPARE body_selector(text,text,text,text,text,text) AS " +
        parameterized,
    );
    const generic = await db.query<{ "QUERY PLAN": string }>(
      "EXPLAIN EXECUTE body_selector(" +
        "'/event/listing_report_submitted','/event/generation_output_edited'," +
        "'context','textCaptureVersion','analyticsOnly','inputPhotoReview')",
    );
    expect(generic.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain(
      "api_logs_compaction_body_candidates",
    );
  } finally {
    await db.close();
  }
});
