import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("billing evidence persistence", () => {
  it("atomically records withdrawal and both receipts, deduplicates retries and restricts public access", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
      );
      await db.exec("CREATE TABLE profiles(id uuid PRIMARY KEY)");
      await db.exec(
        readFileSync(
          "migrations/2026-07-22_subscription_welcome_emails.sql",
          "utf8",
        ).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""),
      );
      await db.exec(
        "INSERT INTO subscription_welcome_emails(email,tier,template_key,stripe_subscription_id,idempotency_key,status) VALUES ('history@example.com','pro','pro_welcome_v1','sub_history','history-key','sent')",
      );
      for (const migration of [
        "2026-10-28_billing_confirmation_evidence.sql",
        "2026-10-28_billing_notices.sql",
        "2026-10-28_withdrawal_receipts.sql",
        "2026-10-28_email_delivery_evidence.sql",
      ])
        await db.exec(readFileSync(`migrations/${migration}`, "utf8"));
      expect(
        (
          await db.query<any>(
            "SELECT status,payload,payload_sha256,first_attempt_at FROM subscription_welcome_emails",
          )
        ).rows[0],
      ).toEqual({
        status: "sent",
        payload: null,
        payload_sha256: null,
        first_attempt_at: null,
      });
      await db.exec(
        "UPDATE subscription_welcome_emails SET status='manual_review'",
      );
      const params = [
        "11111111-1111-4111-8111-111111111111",
        new Date().toISOString(),
        "Customer",
        "customer@example.com",
        "Subscription",
        "I withdraw",
        "hashed-ip",
        JSON.stringify({ html: "receipt" }),
        "hash",
        JSON.stringify({ html: "staff" }),
        "hash",
      ];
      const sql =
        "SELECT receive_withdrawal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result";
      await db.query(sql, params);
      await db.query(sql, params);
      expect(
        (
          await db.query<any>(
            "SELECT count(*)::int AS n FROM billing_withdrawals",
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (await db.query<any>("SELECT count(*)::int AS n FROM billing_notices"))
          .rows[0].n,
      ).toBe(2);
      await expect(
        db.query(sql, [
          ...params.slice(0, 3),
          "other@example.com",
          ...params.slice(4),
        ]),
      ).rejects.toThrow("Request ID already used");
      const key = `withdrawal/${params[0]}`;
      expect(
        (await db.query("SELECT * FROM claim_billing_notice($1)", [key])).rows,
      ).toHaveLength(1);
      expect(
        (await db.query("SELECT * FROM claim_billing_notice($1)", [key])).rows,
      ).toHaveLength(0);
      await db.query(
        "UPDATE billing_notices SET first_attempt_at=now()-interval '25 hours',locked_until=now()-interval '1 minute' WHERE key=$1",
        [key],
      );
      expect(
        (await db.query("SELECT * FROM claim_billing_notice($1)", [key])).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query<any>(
            "SELECT status FROM billing_notices WHERE key=$1",
            [key],
          )
        ).rows[0].status,
      ).toBe("manual_review");
      await db.exec("SET ROLE anon");
      await expect(
        db.query("SELECT * FROM billing_withdrawals"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("SELECT * FROM billing_email_delivery_events"),
      ).rejects.toThrow("permission denied");
      await expect(db.query(sql, params)).rejects.toThrow("permission denied");
    } finally {
      await db.close();
    }
  }, 20000);
});
