import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web metric compaction in PostgreSQL", () => {
  it("removes private evidence, preserves bounded metrics and feedback, and expires metrics", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), endpoint text, image_urls jsonb,raw_prompt text,generated_title text,generated_description text,user_agent text,origin text,ip_address text,user_email text,full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-12_web_metric_compaction.sql", "utf8"),
      );
      const bodies = [
        [
          "/api/generate",
          {
            client: "mobile_web",
            requestId: "request-1",
            imageUrls: ["private-photo"],
            descriptionFooter: "private-note",
          },
        ],
        [
          "/event/copy",
          {
            event: "copy",
            source: "mobile_web",
            transportEventId: "event-1",
            context: {
              analyticsClientId: "browser-1",
              webSessionId: "session-1",
              field: "description",
              description: "private-text",
              imageUrl: "private-url",
            },
          },
        ],
        ["/api/generate", { imageUrls: ["extension-photo"] }],
        [
          "/event/listing_report_submitted",
          { context: { message: "customer feedback" } },
        ],
        [
          "/api/generate",
          { client: "mobile_web", requestId: "expired-request" },
        ],
      ];
      for (const [index, [endpoint, body]] of bodies.entries())
        await db.query(
          "INSERT INTO api_logs(endpoint,full_request_body,created_at,image_urls,raw_prompt,generated_title,generated_description,user_email) VALUES($1,$2,now()-$3::interval,'[\"private-image\"]','private-prompt','private-title','private-description','private-email')",
          [endpoint, JSON.stringify(body), index === 4 ? "31 days" : "8 hours"],
        );
      const rows = await db.query<any>(
        "SELECT id,endpoint FROM api_logs ORDER BY created_at DESC,id",
      );
      await db.query("SELECT compact_api_logs_for_web_metrics($1::uuid[])", [
        rows.rows.map((r) => r.id),
      ]);
      const after = (await db.query<any>("SELECT * FROM api_logs")).rows;
      const web = after.find(
        (r) => r.full_request_body?.requestId === "request-1",
      );
      expect(web.full_request_body).toEqual({
        analyticsOnly: true,
        client: "mobile_web",
        requestId: "request-1",
      });
      expect(web.image_urls).toBeNull();
      expect(web.generated_description).toBeNull();
      expect(web.user_email).toBeNull();
      expect(
        after.find((r) => r.endpoint === "/event/copy").full_request_body,
      ).toEqual({
        analyticsOnly: true,
        event: "copy",
        source: "mobile_web",
        transportEventId: "event-1",
        context: {
          analyticsClientId: "browser-1",
          webSessionId: "session-1",
          field: "description",
        },
      });
      expect(
        after
          .filter((r) => r.endpoint === "/api/generate" && r.id !== web.id)
          .every((r) => r.full_request_body === null),
      ).toBe(true);
      expect(
        after.find((r) => r.endpoint === "/event/listing_report_submitted")
          .full_request_body.context.message,
      ).toBe("customer feedback");
      expect(
        (
          await db.query<any>(
            "SELECT has_function_privilege('anon','compact_api_logs_for_web_metrics(uuid[])','EXECUTE') AS allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
    } finally {
      await db.close();
    }
  }, 20000);
});
