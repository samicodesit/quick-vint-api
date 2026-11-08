import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  createRateLimitedGenerationDatabase,
  owner,
  other,
} from "./fixtures/generationDatabase";

const ipKey = "a".repeat(64);
const anotherIp = "b".repeat(64);
let db: Awaited<ReturnType<typeof createRateLimitedGenerationDatabase>>;

beforeAll(async () => {
  db = await createRateLimitedGenerationDatabase();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    INSERT INTO auth.users SELECT id FROM profiles;
  `);
  for (const migration of [
    "2026-10-27_upgrade_payment_expiry.sql",
    "2026-11-01_user_models.sql",
    "2026-11-01_listing_model_photos.sql",
    "2026-11-08_free_trial_ip_quota.sql",
  ]) {
    await db.exec(readFileSync(`migrations/${migration}`, "utf8"));
  }
}, 30_000);

beforeEach(async () => {
  await db.exec(`
    TRUNCATE generation_reservations, rate_limits, daily_stats, credit_ledger,
      free_trial_ip_usage, user_models, user_model_settings CASCADE;
    UPDATE profiles SET free_lifetime_generations_used=0, api_calls_this_month=0,
      pack_credits=0, subscription_status='free', subscription_tier='free',
      paid_access_expires_at=NULL;
  `);
});

afterAll(async () => {
  await db?.close();
});

type Outcome = { allowed: boolean; reservationId: string; code?: string };

async function queryWithIp<Result>(
  sql: string,
  params: unknown[],
  key?: string,
) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.headers',$1,true)", [
      JSON.stringify({ "x-autolister-free-trial-ip": key }),
    ]);
    const { rows } = await tx.query<{ result: Result }>(sql, params);
    return rows[0].result;
  });
}

function reserve(
  userId: string,
  key?: string,
  mode = "current",
  tier = "free",
) {
  return queryWithIp<Outcome>(
    "SELECT reserve_generation_request_for_current_status($1,$2,$3,100,50,20,5,false) AS result",
    [userId, mode, tier],
    key,
  );
}

it("shares five drafts across accounts and legacy clients", async () => {
  for (let count = 0; count < 4; count++) {
    expect((await reserve(owner, ipKey)).allowed).toBe(true);
  }
  expect((await reserve(other, ipKey, "legacy")).allowed).toBe(true);
  expect(await reserve(other, ipKey)).toMatchObject({
    allowed: false,
    code: "free_lifetime_limit",
  });
  expect((await reserve(other, anotherIp)).allowed).toBe(true);
  expect(
    (
      await db.query<{ free_lifetime_generations_used: number }>(
        "SELECT free_lifetime_generations_used FROM profiles WHERE id=$1",
        [other],
      )
    ).rows[0].free_lifetime_generations_used,
  ).toBe(2);
});

it("keeps the first draft's expiry and opens a new window only after two years", async () => {
  const expiry = async () =>
    (
      await db.query<{ expires_at: Date }>(
        "SELECT expires_at FROM free_trial_ip_usage WHERE ip_key=$1",
        [ipKey],
      )
    ).rows[0].expires_at;
  expect((await reserve(owner, ipKey)).allowed).toBe(true);
  const firstExpiry = await expiry();
  expect(
    (
      await db.query<{ valid: boolean }>(
        "SELECT $1::timestamptz BETWEEN now()+interval '2 years'-interval '5 seconds' AND now()+interval '2 years' AS valid",
        [firstExpiry],
      )
    ).rows[0].valid,
  ).toBe(true);
  for (let count = 0; count < 4; count++) await reserve(owner, ipKey);
  expect((await reserve(other, ipKey)).allowed).toBe(false);
  expect(await expiry()).toEqual(firstExpiry);

  await db.query(
    "UPDATE free_trial_ip_usage SET expires_at=now()-interval '1 second' WHERE ip_key=$1",
    [ipKey],
  );
  expect((await reserve(other, ipKey)).allowed).toBe(true);
  expect(
    (
      await db.query("SELECT used FROM free_trial_ip_usage WHERE ip_key=$1", [
        ipKey,
      ])
    ).rows,
  ).toEqual([{ used: 1 }]);
  expect((await reserve(owner, ipKey)).allowed).toBe(false);
});

it("does not start an IP window for an account that has no free drafts left", async () => {
  await db.query(
    "UPDATE profiles SET free_lifetime_generations_used=5 WHERE id=$1",
    [owner],
  );
  expect((await reserve(owner, ipKey)).allowed).toBe(false);
  expect((await db.query("SELECT * FROM free_trial_ip_usage")).rows).toEqual(
    [],
  );
});

it("purges expired IP records and reservation links without touching a newer window", async () => {
  const old = await reserve(owner, ipKey);
  await db.query(
    "UPDATE free_trial_ip_usage SET expires_at=now()-interval '1 second' WHERE ip_key=$1",
    [ipKey],
  );
  await db.query(
    "UPDATE generation_reservations SET free_trial_ip_expires_at=now()-interval '1 second' WHERE id=$1",
    [old.reservationId],
  );
  expect((await reserve(other, ipKey)).allowed).toBe(true);
  await db.query("SELECT refund_generation_reservation($1)", [
    old.reservationId,
  ]);
  expect(
    (
      await db.query("SELECT used FROM free_trial_ip_usage WHERE ip_key=$1", [
        ipKey,
      ])
    ).rows,
  ).toEqual([{ used: 1 }]);

  const expired = await reserve(other, anotherIp);
  await db.query(
    "UPDATE free_trial_ip_usage SET expires_at=now()-interval '1 second' WHERE ip_key=$1",
    [anotherIp],
  );
  await db.query(
    "UPDATE generation_reservations SET free_trial_ip_expires_at=now()-interval '1 second' WHERE id=$1",
    [expired.reservationId],
  );
  await db.query("SELECT cleanup_expired_free_trial_ip_usage()");
  expect(
    (await db.query("SELECT ip_key FROM free_trial_ip_usage")).rows,
  ).toEqual([{ ip_key: ipKey }]);
  expect(
    (
      await db.query(
        "SELECT free_trial_ip_key FROM generation_reservations WHERE id=$1",
        [expired.reservationId],
      )
    ).rows,
  ).toEqual([{ free_trial_ip_key: null }]);
});

it("returns a slot once on refund and keeps committed usage", async () => {
  const first = await reserve(owner, ipKey);
  for (let count = 0; count < 4; count++) {
    expect((await reserve(owner, ipKey)).allowed).toBe(true);
  }
  await db.query("SELECT refund_generation_reservation($1)", [
    first.reservationId,
  ]);
  await db.query("SELECT refund_generation_reservation($1)", [
    first.reservationId,
  ]);
  const replacement = await reserve(other, ipKey);
  expect(replacement.allowed).toBe(true);
  await db.query("SELECT commit_generation_reservation($1)", [
    replacement.reservationId,
  ]);
  expect(
    (
      await db.query(
        "SELECT free_trial_ip_key FROM generation_reservations WHERE id IN ($1,$2)",
        [first.reservationId, replacement.reservationId],
      )
    ).rows,
  ).toEqual([{ free_trial_ip_key: null }, { free_trial_ip_key: null }]);
  await db.query("SELECT refund_generation_reservation($1)", [
    replacement.reservationId,
  ]);
  await db.exec(
    "UPDATE generation_reservations SET created_at=now()-interval '1 year'",
  );
  await db.query("DELETE FROM generation_reservations WHERE id=$1", [
    replacement.reservationId,
  ]);
  expect((await reserve(other, ipKey)).allowed).toBe(false);
});

it("uses a purchased credit after the network allowance is exhausted", async () => {
  for (let count = 0; count < 5; count++) await reserve(owner, ipKey);
  await db.query("UPDATE profiles SET pack_credits=1 WHERE id=$1", [other]);
  const paid = await reserve(other, ipKey);
  expect(paid.allowed).toBe(true);
  expect(
    (
      await db.query<{ entitlement_type: string }>(
        "SELECT entitlement_type FROM generation_reservations WHERE id=$1",
        [paid.reservationId],
      )
    ).rows[0].entitlement_type,
  ).toBe("pack_credit");
  await db.query(
    "UPDATE profiles SET subscription_status='active',subscription_tier='pro' WHERE id=$1",
    [other],
  );
  expect((await reserve(other, ipKey, "current", "pro")).allowed).toBe(true);
  expect((await reserve(other, "unavailable", "current", "pro")).allowed).toBe(
    true,
  );
});

it("rejects free use without a trustworthy IP and preserves exempt access", async () => {
  expect(await reserve(owner, "unavailable")).toMatchObject({
    allowed: false,
    code: "service_unavailable",
  });
  await db.query("UPDATE profiles SET pack_credits=1 WHERE id=$1", [owner]);
  expect((await reserve(owner, "unavailable")).allowed).toBe(true);
  expect((await reserve(owner)).allowed).toBe(true);
  expect((await db.query("SELECT * FROM free_trial_ip_usage")).rows).toEqual(
    [],
  );
});

it("shares the last slot between web and extension operations and charges a replay only once", async () => {
  for (let count = 0; count < 4; count++) await reserve(owner, ipKey);
  async function operation(user: string, client: string) {
    const request = randomUUID();
    const hash = "c".repeat(64);
    const claim = await queryWithIp<{ recordId: string; attemptId: string }>(
      "SELECT claim_mobile_generation_idempotency($1,$2,$3,$4) AS result",
      [user, client, request, hash],
    );
    return () =>
      queryWithIp<Outcome>(
        "SELECT reserve_and_bind_mobile_generation_reservation($1,$2,$3,$4,$5,$6,'current','free',100,50,20,5,false) AS result",
        [user, claim.recordId, claim.attemptId, client, request, hash],
        ipKey,
      );
  }
  const web = await operation(other, "mobile_web");
  const extension = await operation(owner, "extension");
  expect((await web()).allowed).toBe(true);
  expect(await web()).toMatchObject({
    allowed: false,
    code: "idempotency_bind_failed",
  });
  expect(await extension()).toMatchObject({
    allowed: false,
    code: "free_lifetime_limit",
  });
});

it("shares the allowance with photo-only drafts and does not charge photo replays", async () => {
  await db.query(
    "INSERT INTO user_model_settings(user_id,enabled) VALUES ($1,true)",
    [other],
  );
  await db.query(
    `INSERT INTO user_models
    (user_id,preferences,seed,scene,scene_fingerprint,prompt_version,catalog_version,state)
    VALUES ($1,'{}','seed','{}','x',1,1,'ready')`,
    [other],
  );
  for (let count = 0; count < 4; count++) await reserve(owner, ipKey);
  const photo = (fingerprint: string) =>
    queryWithIp<{ id?: string; code?: string }>(
      "SELECT listing_photo_mutate($1,'admit',$2) AS result",
      [
        other,
        JSON.stringify({
          fingerprint,
          sources: ["source"],
          limits: {
            pricingLimitsMode: "current",
            effectiveTier: "free",
            monthlyLimit: 100,
            dailyLimit: 50,
            burstLimit: 20,
            freeLifetimeLimit: 5,
            hasUnlimitedDaily: false,
          },
        }),
      ],
      ipKey,
    );
  const first = await photo("first");
  expect(first.id).toBeTruthy();
  expect((await photo("first")).id).toBe(first.id);
  expect(await photo("second")).toMatchObject({ code: "free_lifetime_limit" });
});

it("includes the no-emoji retry in the IP cap", async () => {
  for (let count = 0; count < 4; count++) await reserve(owner, ipKey);
  const retry = (user: string) =>
    queryWithIp<string>(
      `INSERT INTO generation_reservations(user_id,entitlement_type,metadata)
     VALUES ($1,'free_lifetime','{"emoji_retry":true}') RETURNING id AS result`,
      [user],
      ipKey,
    );
  expect(await retry(owner)).toBeTruthy();
  await expect(retry(other)).rejects.toMatchObject({ code: "P5IP1" });
});
