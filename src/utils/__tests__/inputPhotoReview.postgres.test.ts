import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps bounded photo proof until 24 hours while clearing other private evidence at six hours", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), endpoint text, response_status integer, image_urls jsonb,raw_prompt text,generated_title text,generated_description text,user_agent text,origin text,ip_address text,user_email text,full_request_body jsonb);",
    );
    await db.exec(
      readFileSync("migrations/2026-11-02_input_photo_review.sql", "utf8"),
    );
    for (const client of ["mobile_web", "extension"]) {
      const proof = {
        v: 1,
        expiresAt: "2026-11-04T00:00:00Z",
        images: [
          {
            index: 0,
            path: "00000000-0000-4000-8000-000000000001/000000-upload.jpg",
            sha256: "a".repeat(64),
          },
        ],
      };
      const body = {
        client,
        requestId: "request",
        generationCommitted: true,
        generationSourceCommit: "a".repeat(40),
        openaiActualModel: "returned-model",
        inputPhotoReview: proof,
        imageUrls: ["private-url"],
        customInstructions: "private instructions",
      };
      const row = (
        await db.query<{ id: string }>(
          "INSERT INTO api_logs(endpoint,response_status,created_at,full_request_body,user_email,raw_prompt,image_urls) VALUES('/api/generate',200,now()-interval '8 hours',$1,'private email','private prompt','[\"private url\"]') RETURNING id",
          [JSON.stringify(body)],
        )
      ).rows[0];
      for (let repeat = 0; repeat < 2; repeat++)
        await db.query("SELECT compact_api_logs_for_web_metrics($1::uuid[])", [
          [row.id],
        ]);
      const retained = (
        await db.query<any>("SELECT * FROM api_logs WHERE id=$1", [row.id])
      ).rows[0];
      expect(retained.full_request_body.inputPhotoReview).toEqual(proof);
      expect(retained.full_request_body).toMatchObject({
        client,
        requestId: "request",
        openaiActualModel: "returned-model",
        generationCommitted: true,
      });
      expect(JSON.stringify(retained)).not.toContain("private");
      await db.query(
        "UPDATE api_logs SET created_at=now()-interval '24 hours' WHERE id=$1",
        [row.id],
      );
      await db.query("SELECT compact_api_logs_for_web_metrics($1::uuid[])", [
        [row.id],
      ]);
      const expired = (
        await db.query<any>(
          "SELECT full_request_body FROM api_logs WHERE id=$1",
          [row.id],
        )
      ).rows[0];
      expect(expired.full_request_body?.inputPhotoReview).toBeUndefined();
      if (client === "mobile_web")
        expect(expired.full_request_body.requestId).toBe("request");
      else expect(expired.full_request_body).toBeNull();
    }
  } finally {
    await db.close();
  }
});
