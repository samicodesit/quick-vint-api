import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createRateLimitedGenerationDatabase } from "./fixtures/generationDatabase";

let db: Awaited<ReturnType<typeof createRateLimitedGenerationDatabase>>;
const migration = "migrations/2026-11-18_photo_source_allowance.sql";
beforeAll(async () => {
  db = await createRateLimitedGenerationDatabase();
  await db.exec(`CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    ALTER TABLE profiles ADD COLUMN paid_access_expires_at timestamptz,
      ADD COLUMN last_api_call_reset date,
      ADD COLUMN last_usage_period_end timestamptz,
      ADD COLUMN last_usage_reset_invoice_id text;`);
  await db.exec(readFileSync("migrations/2026-11-01_user_models.sql", "utf8"));
  await db.exec(
    readFileSync("migrations/2026-11-01_listing_model_photos.sql", "utf8"),
  );
  await db.exec(
    readFileSync("migrations/2026-11-08_free_trial_ip_quota.sql", "utf8"),
  );
  if (existsSync(migration)) await db.exec(readFileSync(migration, "utf8"));
  await db.exec(
    readFileSync("migrations/2026-11-18_photo_metrics_ack.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

async function rpc(user: string, action: string, input: object = {}) {
  return (
    await db.query<any>("select listing_photo_mutate($1,$2,$3::jsonb) result", [
      user,
      action,
      JSON.stringify(input),
    ])
  ).rows[0].result;
}
async function setup(entitlement = "plan") {
  const user = randomUUID();
  await db.query("insert into auth.users values($1)", [user]);
  await db.query(
    "insert into profiles(id,subscription_tier,subscription_status,last_api_call_reset,last_usage_reset_invoice_id,last_usage_period_end) values($1,'starter','active','2020-01-01','invoice-old',now()+interval '30 days')",
    [user],
  );
  await db.query(
    "insert into user_model_settings(user_id,enabled) values($1,true)",
    [user],
  );
  await db.query(
    "insert into user_models(user_id,preferences,seed,scene,scene_fingerprint,prompt_version,catalog_version,state,object_key) values($1,'{}','seed','{}','scene',1,1,'ready','front.jpg')",
    [user],
  );
  const ip = user.replace(/-/g, "").repeat(2);
  if (entitlement !== "plan") {
    await db.query(
      "update profiles set subscription_tier='free',subscription_status='free',free_lifetime_generations_used=$2,pack_credits=$3 where id=$1",
      [
        user,
        entitlement === "pack_credit" ? 5 : 0,
        entitlement === "pack_credit" ? 1 : 0,
      ],
    );
    await db.query("select set_config('request.headers',$1,false)", [
      JSON.stringify({ "x-autolister-free-trial-ip": ip }),
    ]);
  }
  const job = await rpc(user, "admit", {
    fingerprint: randomUUID(),
    sources: ["source"],
    limits: {
      pricingLimitsMode: "current",
      effectiveTier: entitlement === "plan" ? "starter" : "free",
      monthlyLimit: 75,
      dailyLimit: 10,
      burstLimit: 20,
      freeLifetimeLimit: 5,
      hasUnlimitedDaily: false,
    },
  });
  return { user, job, ip };
}
async function status(id: string) {
  return (
    await db.query<any>(
      "select status from generation_reservations where id=$1",
      [id],
    )
  ).rows[0].status;
}
async function fail(
  user: string,
  id: string,
  stage?: string,
  payload: object = {},
) {
  const job = await rpc(user, "claim", { id });
  if (stage) await rpc(user, "stage", { id, lease: job.lease_token, stage });
  return rpc(user, "save", {
    id,
    lease: job.lease_token,
    state: "failed",
    errorCode: "photo_source_snapshot_failed",
    payload,
  });
}
async function terminal(user: string, id: string) {
  await fail(user, id, "source");
  await rpc(user, "retry", { id });
  await fail(user, id, "source");
}

it("returns a terminal unused source reservation once and preserves request pacing", async () => {
  const { user, job } = await setup();
  await terminal(user, job.id);
  expect(await status(job.generation_id)).toBe("refunded");
  await rpc(user, "get", { id: job.id });
  const profile = (
    await db.query<any>(
      "select api_calls_this_month,pack_credits from profiles where id=$1",
      [user],
    )
  ).rows[0];
  expect(profile).toEqual({ api_calls_this_month: 0, pack_credits: 0 });
  const rates = (
    await db.query<any>(
      "select window_type,count from rate_limits where user_id=$1",
      [user],
    )
  ).rows;
  expect(rates.find((r: any) => r.window_type === "day").count).toBe(0);
  expect(rates.find((r: any) => r.window_type === "minute").count).toBe(1);
  await expect(rpc(user, "retry", { id: job.id })).rejects.toThrow(
    /retry_limit/,
  );
});
it("keeps the first failure reserved for its existing single retry", async () => {
  const { user, job } = await setup();
  await fail(user, job.id, "source");
  expect(await status(job.generation_id)).toBe("pending");
  await rpc(user, "retry", { id: job.id });
  const claimed = await rpc(user, "claim", { id: job.id });
  await rpc(user, "save", {
    id: job.id,
    lease: claimed.lease_token,
    payload: { plan: { eligible: true } },
  });
  expect(await status(job.generation_id)).toBe("committed");
});
it("does not release a pending reservation once any AI stage has been attempted", async () => {
  const { user, job } = await setup();
  await fail(user, job.id, "classify");
  await rpc(user, "retry", { id: job.id });
  await fail(user, job.id, "source");
  expect(await status(job.generation_id)).toBe("pending");
});
it("does not refund committed or accepted partial photo work", async () => {
  const { user, job } = await setup();
  await fail(user, job.id, "source");
  await rpc(user, "retry", { id: job.id });
  await fail(user, job.id, "primary", {
    plan: { eligible: true },
    secondary: { state: "ready", key: "accepted.jpg" },
  });
  expect(await status(job.generation_id)).toBe("committed");
});
it("returns the original day slot without reducing usage after a paid-period reset", async () => {
  const { user, job } = await setup();
  await fail(user, job.id, "source");
  await rpc(user, "retry", { id: job.id });
  await db.query(
    "update profiles set api_calls_this_month=2,last_usage_reset_invoice_id='invoice-new',last_usage_period_end=now()+interval '60 days',last_api_call_reset=current_date where id=$1",
    [user],
  );
  await fail(user, job.id, "source");
  expect(await status(job.generation_id)).toBe("refunded");
  expect(
    (
      await db.query<any>(
        "select api_calls_this_month from profiles where id=$1",
        [user],
      )
    ).rows[0].api_calls_this_month,
  ).toBe(2);
});
it("releases an expired terminal retry lease and fences the late worker", async () => {
  const { user, job } = await setup();
  await fail(user, job.id, "source");
  await rpc(user, "retry", { id: job.id });
  const active = await rpc(user, "claim", { id: job.id });
  await rpc(user, "stage", {
    id: job.id,
    lease: active.lease_token,
    stage: "source",
  });
  await db.query(
    "update listing_photo_jobs set lease_until=now()-interval '1 second' where id=$1",
    [job.id],
  );
  expect((await rpc(user, "get", { id: job.id })).state).toBe("failed");
  expect(await status(job.generation_id)).toBe("refunded");
  expect(
    await rpc(user, "stage", {
      id: job.id,
      lease: active.lease_token,
      stage: "classify",
    }),
  ).toBeNull();
});
it("never releases another owner's or an actively running job's allowance", async () => {
  const { user, job } = await setup();
  await rpc(user, "claim", { id: job.id });
  if (existsSync(migration)) {
    const foreign = await db.query<any>(
      "select release_unused_photo_source_allowance($1,$2) result",
      [randomUUID(), job.id],
    );
    expect(foreign.rows[0].result.released).toBe(false);
    const active = await db.query<any>(
      "select release_unused_photo_source_allowance($1,$2) result",
      [user, job.id],
    );
    expect(active.rows[0].result.released).toBe(false);
  }
  expect(await status(job.generation_id)).toBe("pending");
});
it("returns free allowance through the existing IP-resolution trigger", async () => {
  const { user, job, ip } = await setup("free_lifetime");
  expect(
    (
      await db.query<any>(
        "select used from free_trial_ip_usage where ip_key=$1",
        [ip],
      )
    ).rows[0].used,
  ).toBe(1);
  await terminal(user, job.id);
  expect(await status(job.generation_id)).toBe("refunded");
  expect(
    (
      await db.query<any>(
        "select free_lifetime_generations_used from profiles where id=$1",
        [user],
      )
    ).rows[0].free_lifetime_generations_used,
  ).toBe(0);
  expect(
    (await db.query("select * from free_trial_ip_usage where ip_key=$1", [ip]))
      .rows,
  ).toEqual([]);
});
it("returns exactly one original pack credit with a single ledger refund", async () => {
  const { user, job } = await setup("pack_credit");
  await terminal(user, job.id);
  await db.query("select release_unused_photo_source_allowance($1,$2)", [
    user,
    job.id,
  ]);
  expect(
    (
      await db.query<any>("select pack_credits from profiles where id=$1", [
        user,
      ])
    ).rows[0].pack_credits,
  ).toBe(1);
  expect(
    (
      await db.query<any>(
        "select count(*)::integer count from credit_ledger where user_id=$1 and type='refund'",
        [user],
      )
    ).rows[0].count,
  ).toBe(1);
});
it("does not release a bundled text request or an unclassified failure code", async () => {
  const { user, job } = await setup();
  const bundled = await rpc(user, "create", {
    fingerprint: randomUUID(),
    generationId: job.generation_id,
  });
  await terminal(user, bundled.id);
  expect(await status(job.generation_id)).toBe("pending");
  await fail(user, job.id, "source");
  await rpc(user, "retry", { id: job.id });
  const claim = await rpc(user, "claim", { id: job.id });
  await rpc(user, "save", {
    id: job.id,
    lease: claim.lease_token,
    state: "failed",
  });
  expect(await status(job.generation_id)).toBe("pending");
});
it("repairs a legacy pending hold when its original period is established", async () => {
  const { user, job } = await setup();
  await db.query(
    "update listing_photo_jobs set payload=payload-'allowancePeriod' where id=$1",
    [job.id],
  );
  await terminal(user, job.id);
  expect(await status(job.generation_id)).toBe("refunded");
});
it("requires review rather than guessing for an ambiguous legacy same-day reset", async () => {
  const { user, job } = await setup();
  await db.query(
    "update listing_photo_jobs set payload=payload-'allowancePeriod' where id=$1",
    [job.id],
  );
  await db.query(
    "update profiles set last_api_call_reset=current_date where id=$1",
    [user],
  );
  await terminal(user, job.id);
  expect(await status(job.generation_id)).toBe("pending");
  expect(
    (
      await db.query<any>(
        "select release_unused_photo_source_allowance($1,$2) result",
        [user, job.id],
      )
    ).rows[0].result.reason,
  ).toBe("period_review_required");
});
it("does not expose allowance repair to public authenticated clients", async () => {
  const { user, job } = await setup();
  try {
    await db.exec("set role authenticated");
    await expect(
      db.query("select release_unused_photo_source_allowance($1,$2)", [
        user,
        job.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

it("acknowledges a source status write without returning photo bytes and fences stale workers", async () => {
  const { user, job } = await setup();
  const { lease_token: lease } = await rpc(user, "claim", { id: job.id });
  const attempt = await rpc(user, "stage", {
    id: job.id,
    lease,
    stage: "source",
  });
  const input = {
    id: job.id,
    lease,
    attemptId: attempt.id,
    cost: 0,
    metrics: {},
    ackOnly: true,
  };
  const bigSources = Array.from(
    { length: 16 },
    () => "data:image/jpeg;base64," + "A".repeat(210000),
  );
  await rpc(user, "save", {
    id: job.id,
    lease,
    payload: { sources: bigSources },
  });
  await db.query(
    "update listing_photo_jobs set lease_until=now()+interval '5 seconds' where id=$1",
    [job.id],
  );
  expect(await rpc(user, "metrics", input)).toBe(true);
  expect(
    (
      await db.query(
        "select lease_until > now()+interval '90 seconds' as renewed from listing_photo_jobs where id=$1",
        [job.id],
      )
    ).rows,
  ).toEqual([{ renewed: true }]);
  const legacy = await rpc(user, "metrics", { ...input, ackOnly: false });
  expect(legacy.payload.sources).toEqual(bigSources);
  expect(
    await rpc(user, "metrics", { ...input, attemptId: randomUUID() }),
  ).toBeNull();
  expect(
    await rpc(user, "metrics", { ...input, lease: randomUUID() }),
  ).toBeNull();
  expect(
    (
      await db.query(
        "select status,cost_usd::float8 as cost from listing_photo_attempts where id=$1",
        [attempt.id],
      )
    ).rows,
  ).toEqual([{ status: "complete", cost: 0 }]);
  await db.query(
    "update listing_photo_jobs set lease_until=now()-interval '1 second' where id=$1",
    [job.id],
  );
  expect(await rpc(user, "metrics", input)).toBeNull();
  expect((await rpc(user, "get", { id: job.id })).error_code).toBe(
    "worker_interrupted",
  );
});
