import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createRateLimitedGenerationDatabase,
  owner,
} from "./fixtures/generationDatabase";
let db: Awaited<ReturnType<typeof createRateLimitedGenerationDatabase>>;
beforeAll(async () => {
  db = await createRateLimitedGenerationDatabase();
  await db.exec(
    readFileSync("migrations/2026-10-27_upgrade_payment_expiry.sql", "utf8"),
  );
  await db.query(
    "UPDATE profiles SET subscription_tier='pro', subscription_status='active', paid_access_expires_at=now()+interval '1 hour' WHERE id=$1",
    [owner],
  );
});
afterAll(async () => {
  await db?.close();
});
it("blocks expired protected access in the atomic reservation without waiting for a webhook", async () => {
  const reserve = () =>
    db.query<any>(
      "SELECT reserve_generation_request_for_current_status($1,'current','pro',250,25,20,5,false) AS result",
      [owner],
    );
  expect((await reserve()).rows[0].result.allowed).toBe(true);
  await db.query(
    "UPDATE profiles SET paid_access_expires_at=now()-interval '1 second' WHERE id=$1",
    [owner],
  );
  expect((await reserve()).rows[0].result).toMatchObject({
    allowed: false,
    code: "payment_required",
  });
  expect(
    (
      await db.query<any>(
        "SELECT api_calls_this_month FROM profiles WHERE id=$1",
        [owner],
      )
    ).rows[0].api_calls_this_month,
  ).toBe(1);
  await db.query(
    "UPDATE profiles SET paid_access_expires_at=NULL WHERE id=$1",
    [owner],
  );
  expect((await reserve()).rows[0].result.allowed).toBe(true);
});
it("does not let a client clear its own protected-access expiry", async () => {
  await db.query(
    "UPDATE profiles SET paid_access_expires_at=now() WHERE id=$1",
    [owner],
  );
  await db.exec(
    "GRANT SELECT, UPDATE ON profiles TO authenticated; SET ROLE authenticated;",
  );
  try {
    await expect(
      db.query("UPDATE profiles SET paid_access_expires_at=NULL WHERE id=$1", [
        owner,
      ]),
    ).rejects.toThrow(/billing access expiry/);
  } finally {
    await db.exec("RESET ROLE;");
  }
});
it("allows purchased credits after cancellation clears the paid-access marker", async () => {
  await db.query(
    "UPDATE profiles SET subscription_tier='free', subscription_status='canceled', paid_access_expires_at=NULL, free_lifetime_generations_used=5, pack_credits=2 WHERE id=$1",
    [owner],
  );
  const result = await db.query<any>(
    "SELECT reserve_generation_request_for_current_status($1,'current','free',5,5,10,5,false) AS result",
    [owner],
  );
  expect(result.rows[0].result.allowed).toBe(true);
  expect(
    (
      await db.query<any>("SELECT pack_credits FROM profiles WHERE id=$1", [
        owner,
      ])
    ).rows[0].pack_credits,
  ).toBe(1);
});
