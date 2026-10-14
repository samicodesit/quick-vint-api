import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  createRateLimitedGenerationDatabase,
  owner,
} from "./fixtures/generationDatabase";
vi.mock("../../../utils/supabaseClient", () => ({ supabase: {} }));
import {
  getGenerationReservationParams,
  type UserProfile,
} from "../../../utils/rateLimiter";
import type { PricingLimitsMode } from "../../../utils/tierConfig";

let db: PGlite;
beforeAll(async () => {
  db = await createRateLimitedGenerationDatabase();
}, 30000);
afterAll(async () => {
  await db?.close();
});
// PostgreSQL now() remains fixed for the transaction, so the batch cannot
// accidentally cross a minute boundary and conceal a restrictive burst cap.
beforeEach(async () => {
  await db.exec("BEGIN");
});
afterEach(async () => {
  await db.exec("ROLLBACK");
});

async function reserve(
  client: "mobile_web" | "extension",
  mode: PricingLimitsMode = "current",
  forcedBurst?: number,
) {
  const request = randomUUID();
  const hash = "a".repeat(64);
  const claim = (
    await db.query<{ result: { recordId: string; attemptId: string } }>(
      "SELECT claim_mobile_generation_idempotency($1,$2,$3,$4) AS result",
      [owner, client, request, hash],
    )
  ).rows[0].result;
  const profile = (
    await db.query<UserProfile>("SELECT * FROM profiles WHERE id=$1", [owner])
  ).rows[0];
  const p = getGenerationReservationParams(profile, mode);
  const result = (
    await db.query<{
      result: { allowed: boolean; reservationId?: string; code?: string };
    }>(
      "SELECT reserve_and_bind_mobile_generation_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS result",
      [
        owner,
        claim.recordId,
        claim.attemptId,
        client,
        request,
        hash,
        p.pricingLimitsMode,
        p.effectiveTier,
        p.monthlyLimit,
        p.dailyLimit,
        forcedBurst ?? p.burstLimit,
        p.freeLifetimeLimit,
        p.hasUnlimitedDaily,
      ],
    )
  ).rows[0].result;
  if (result.allowed)
    await db.query("SELECT commit_generation_reservation($1)", [
      result.reservationId,
    ]);
  return result;
}
async function counters() {
  return (
    await db.query<{
      free_lifetime_generations_used: number;
      pack_credits: number;
      api_calls_this_month: number;
    }>(
      "SELECT free_lifetime_generations_used, pack_credits, api_calls_this_month FROM profiles WHERE id=$1",
      [owner],
    )
  ).rows[0];
}

for (const client of ["mobile_web", "extension"] as const) {
  it(`${client}: completes all five trial items in one minute and still rejects a sixth without charging`, async () => {
    for (let i = 0; i < 5; i++)
      expect((await reserve(client)).allowed, `Trial item ${i + 1}`).toBe(true);
    expect(await counters()).toMatchObject({
      free_lifetime_generations_used: 5,
      api_calls_this_month: 5,
    });
    expect(await reserve(client)).toMatchObject({
      allowed: false,
      code: "free_lifetime_limit",
    });
    expect(await counters()).toMatchObject({
      free_lifetime_generations_used: 5,
      api_calls_this_month: 5,
    });
  });
  it(`${client}: a 20-item paid-credit batch keeps a stable burst cap as the balance falls`, async () => {
    await db.query(
      "UPDATE profiles SET free_lifetime_generations_used=5, pack_credits=60 WHERE id=$1",
      [owner],
    );
    for (let i = 0; i < 20; i++)
      expect((await reserve(client)).allowed, `Credit item ${i + 1}`).toBe(
        true,
      );
    expect(await counters()).toMatchObject({
      pack_credits: 40,
      api_calls_this_month: 20,
    });
    expect(await reserve(client)).toMatchObject({
      allowed: false,
      code: "burst_limit",
    });
    expect(await counters()).toMatchObject({
      pack_credits: 40,
      api_calls_this_month: 20,
    });
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM credit_ledger WHERE type='consume'",
        )
      ).rows[0].n,
    ).toBe(20);
  });
}

it("Starter keeps its ten-per-day allowance and returns the actual quota paywall after ten fast successes", async () => {
  await db.query(
    "UPDATE profiles SET subscription_tier='starter', subscription_status='active' WHERE id=$1",
    [owner],
  );
  for (let i = 0; i < 10; i++)
    expect((await reserve("mobile_web")).allowed).toBe(true);
  expect(await reserve("mobile_web")).toMatchObject({
    allowed: false,
    code: "daily_limit",
  });
  expect((await counters()).api_calls_this_month).toBe(10);
});
it("the legacy extension keeps its fifteen-per-day Starter allowance without the old ten-per-minute obstruction", async () => {
  await db.query(
    "UPDATE profiles SET subscription_tier='starter', subscription_status='active', is_legacy_plan=true WHERE id=$1",
    [owner],
  );
  for (let i = 0; i < 15; i++)
    expect((await reserve("extension", "legacy")).allowed).toBe(true);
  expect(await reserve("extension", "legacy")).toMatchObject({
    allowed: false,
    code: "daily_limit",
  });
});
it("negative control: the real SQL rejects item four with the old three-per-minute cap", async () => {
  for (let i = 0; i < 3; i++)
    expect((await reserve("mobile_web", "current", 3)).allowed).toBe(true);
  expect(await reserve("mobile_web", "current", 3)).toMatchObject({
    allowed: false,
    code: "burst_limit",
  });
  expect((await counters()).free_lifetime_generations_used).toBe(3);
});

for (const [tier, burst] of [
  ["pro", 20],
  ["business", 30],
] as const) {
  it(`${tier}: retains its existing ${burst}-per-minute ceiling`, async () => {
    await db.query(
      "UPDATE profiles SET subscription_tier=$2, subscription_status='active' WHERE id=$1",
      [owner, tier],
    );
    for (let i = 0; i < burst; i++)
      expect((await reserve("mobile_web")).allowed).toBe(true);
    expect(await reserve("mobile_web")).toMatchObject({
      allowed: false,
      code: "burst_limit",
    });
    expect((await counters()).api_calls_this_month).toBe(burst);
  });
}
it("a credit pack containing exactly twenty credits can complete a full twenty-item batch", async () => {
  await db.query(
    "UPDATE profiles SET free_lifetime_generations_used=5, pack_credits=20 WHERE id=$1",
    [owner],
  );
  for (let i = 0; i < 20; i++)
    expect((await reserve("mobile_web")).allowed, `Paid item ${i + 1}`).toBe(
      true,
    );
  expect(await counters()).toMatchObject({
    pack_credits: 0,
    api_calls_this_month: 20,
  });
});
it("Starter retains its 75 monthly limit even with a more permissive request pace", async () => {
  await db.query(
    "UPDATE profiles SET subscription_tier='starter', subscription_status='active', api_calls_this_month=74 WHERE id=$1",
    [owner],
  );
  expect((await reserve("extension")).allowed).toBe(true);
  expect(await reserve("extension")).toMatchObject({
    allowed: false,
    code: "monthly_limit",
  });
  expect((await counters()).api_calls_this_month).toBe(75);
});
