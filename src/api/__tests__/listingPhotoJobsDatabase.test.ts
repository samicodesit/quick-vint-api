import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = randomUUID();
async function rpc(
  action: string,
  input: object = {},
  user = owner,
): Promise<any> {
  return (
    await db.query<any>("select listing_photo_mutate($1,$2,$3::jsonb) result", [
      user,
      action,
      JSON.stringify(input),
    ])
  ).rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE daily_stats(date date primary key,estimated_cost numeric);",
  );
  await db.query("insert into auth.users values($1)", [owner]);
  await db.exec(readFileSync("migrations/2026-11-01_user_models.sql", "utf8"));
  await db.exec(
    readFileSync("migrations/2026-11-01_listing_model_photos.sql", "utf8"),
  );
  await db.query(
    "insert into user_model_settings(user_id,enabled) values($1,true)",
    [owner],
  );
  await db.query(
    "insert into user_models(user_id,preferences,seed,scene,scene_fingerprint,prompt_version,catalog_version,state,object_key) values($1,'{}','seed','{}','x',1,1,'ready','front.jpg')",
    [owner],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("reuses source fingerprints and hides jobs from other users", async () => {
  const a = await rpc("create", {
    fingerprint: "a",
    generationId: "admitted",
    sources: ["source"],
  });
  expect(
    (await rpc("create", { fingerprint: "a", generationId: "second" })).id,
  ).toBe(a.id);
  expect(await rpc("get", { id: a.id }, randomUUID())).toBeNull();
  await db.exec("SET ROLE authenticated");
  await expect(rpc("get", { id: a.id })).rejects.toThrow(/permission denied/);
  await db.exec("RESET ROLE");
});
it("allows two workers, fences duplicate claims and never replays an uncertain attempt", async () => {
  const jobs = await Promise.all(
    ["b", "c", "d"].map((fingerprint) =>
      rpc("create", { fingerprint, generationId: "admitted" }),
    ),
  );
  const first = await rpc("claim", { id: jobs[0].id });
  expect(first.lease_token).toBeTruthy();
  expect(await rpc("claim", { id: jobs[0].id })).toBeNull();
  expect(await rpc("claim", { id: jobs[1].id })).toBeTruthy();
  expect(await rpc("claim", { id: jobs[2].id })).toBeNull();
  await rpc("stage", {
    id: first.id,
    lease: first.lease_token,
    stage: "primary",
  });
  await db.query(
    "update listing_photo_jobs set lease_until=now()-interval '1 second' where id=$1",
    [first.id],
  );
  expect(await rpc("claim", { id: first.id })).toBeNull();
  expect((await rpc("get", { id: first.id })).state).toBe("failed");
  expect(
    await rpc("save", {
      id: first.id,
      lease: first.lease_token,
      state: "ready",
    }),
  ).toBeNull();
  const retried = await rpc("retry", { id: first.id });
  expect(retried.retry_count).toBe(1);
  const claim = await rpc("claim", { id: first.id });
  await rpc("save", {
    id: first.id,
    lease: claim.lease_token,
    state: "failed",
  });
  await expect(rpc("retry", { id: first.id })).rejects.toThrow(/retry_limit/);
});
it("disabling prevents work and late publication", async () => {
  await db.query(
    "update user_model_settings set enabled=false where user_id=$1",
    [owner],
  );
  expect(
    await rpc("create", { fingerprint: "disabled", generationId: "admitted" }),
  ).toBeNull();
  const running = (
    await db.query<any>(
      "select * from listing_photo_jobs where state='running' limit 1",
    )
  ).rows[0];
  expect(
    await rpc("save", {
      id: running.id,
      lease: running.lease_token,
      state: "ready",
    }),
  ).toBeNull();
  await db.query(
    "update user_model_settings set enabled=true where user_id=$1",
    [owner],
  );
});
it("reserves image spend alongside existing text spend", async () => {
  await db.exec("insert into daily_stats values(current_date,100)");
  const job = await rpc("create", {
    fingerprint: "budget",
    generationId: "admitted",
  });
  await expect(rpc("claim", { id: job.id })).rejects.toThrow(/photo_budget/);
});
it("keeps daily reservations stable across queue resumes and unrelated status updates", async () => {
  await db.exec("delete from daily_stats");
  await db.exec(
    "update listing_photo_jobs set state='failed' where state='running'",
  );
  const job = await rpc("create", {
    fingerprint: "resume-budget",
    generationId: "admitted",
  });
  let claimed = await rpc("claim", { id: job.id });
  const before = (
    await db.query<any>("select listing_photo_daily_cost() as cost")
  ).rows[0].cost;
  await rpc("save", {
    id: job.id,
    lease: claimed.lease_token,
    state: "queued",
    payload: { phase: "preparing" },
  });
  claimed = await rpc("claim", { id: job.id });
  expect(
    (await db.query<any>("select listing_photo_daily_cost() as cost")).rows[0]
      .cost,
  ).toBe(before);
  const attempt = await rpc("stage", {
    id: job.id,
    lease: claimed.lease_token,
    stage: "source",
    objectKey: "source.jpg",
  });
  expect(
    Date.parse(attempt.retain_until) - Date.parse(attempt.created_at),
  ).toBeLessThanOrEqual(86400000);
});
it("photo-only admission reserves once and does not commit an ineligible item", async () => {
  await db.exec(`CREATE TABLE photo_test_reservations(id uuid,status text);
 CREATE OR REPLACE FUNCTION reserve_generation_request_for_current_status(p_user_id uuid,p_pricing_limits_mode text,p_effective_tier text,p_monthly_limit integer,p_daily_limit integer,p_burst_limit integer,p_free_lifetime_limit integer,p_has_unlimited_daily boolean) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r uuid:=gen_random_uuid(); BEGIN INSERT INTO photo_test_reservations VALUES(r,'pending'); RETURN jsonb_build_object('allowed',true,'reservationId',r); END $$;
 CREATE FUNCTION commit_generation_reservation(uuid) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE photo_test_reservations SET status='committed' WHERE id=$1; RETURN true; END $$;
 CREATE FUNCTION refund_generation_reservation(uuid,text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE photo_test_reservations SET status='refunded' WHERE id=$1 AND status='pending'; RETURN true; END $$;`);
  const input = {
    fingerprint: "photos-only",
    sources: ["original"],
    limits: {},
  };
  const a = await rpc("admit", input);
  const b = await rpc("admit", input);
  expect(a.id).toBe(b.id);
  expect(
    (await db.query<any>("select * from photo_test_reservations")).rows,
  ).toHaveLength(1);
  const claimed = await rpc("claim", { id: a.id });
  await rpc("save", { id: a.id, lease: claimed.lease_token, state: "skipped" });
  expect(
    (await db.query<any>("select status from photo_test_reservations")).rows[0]
      .status,
  ).toBe("refunded");
});
it("returns unused photo-only allowance on cancellation and source expiry", async () => {
  const cancelled = await rpc("admit", {
    fingerprint: "cancel-admission",
    limits: {},
  });
  await rpc("cancel", { id: cancelled.id });
  const expired = await rpc("admit", {
    fingerprint: "expire-admission",
    limits: {},
  });
  await db.query(
    "update listing_photo_jobs set source_expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  await db.exec("select listing_photo_cleanup()");
  const result = await db.query<any>(
    "select status from photo_test_reservations where id=ANY($1::uuid[])",
    [[cancelled.generation_id, expired.generation_id]],
  );
  expect(result.rows.map((r) => r.status)).toEqual(["refunded", "refunded"]);
  expect(
    (await rpc("get", { id: expired.id })).payload.sources,
  ).toBeUndefined();
});
it("recovers cancelled rear work only on explicit retry and retains uncertain spend", async () => {
  const rear = await rpc("create", {
    kind: "rear",
    fingerprint: "rear-recovery",
  });
  const first = await rpc("claim", { id: rear.id });
  await rpc("stage", {
    id: rear.id,
    lease: first.lease_token,
    stage: "primary",
  });
  await db.query(
    "update user_model_settings set enabled=false where user_id=$1",
    [owner],
  );
  expect(await rpc("get", { id: rear.id })).toBeNull();
  await db.query(
    "update user_model_settings set enabled=true where user_id=$1",
    [owner],
  );
  expect(
    (await rpc("create", { kind: "rear", fingerprint: "rear-recovery" })).state,
  ).toBe("cancelled");
  expect(await rpc("claim", { id: rear.id })).toBeNull();
  await db.query(
    "update listing_photo_jobs set source_expires_at=now()-interval '1 day' where id=$1",
    [rear.id],
  );
  const retry = await rpc("retry", { id: rear.id });
  expect(retry.retry_count).toBe(1);
  const next = await rpc("claim", { id: rear.id });
  expect(next.lease_token).not.toBe(first.lease_token);
  expect(Number(next.reserved_usd)).toBeCloseTo(0.16);
  expect(
    await rpc("save", {
      id: rear.id,
      lease: first.lease_token,
      state: "ready",
    }),
  ).toBeNull();
  await rpc("save", { id: rear.id, lease: next.lease_token, state: "failed" });
  await expect(rpc("retry", { id: rear.id })).rejects.toThrow(/retry_limit/);
});
it("new photo-only admission replaces cancelled work without reusing a refunded credit or erasing spend", async () => {
  await db.exec(
    "update listing_photo_jobs set state='failed' where state='running'",
  );
  const input = {
    fingerprint: "readmit-cancelled",
    limits: {},
    sources: ["original"],
  };
  const old = await rpc("admit", input),
    claimed = await rpc("claim", { id: old.id });
  await rpc("stage", {
    id: old.id,
    lease: claimed.lease_token,
    stage: "primary",
  });
  await rpc("cancel", { id: old.id });
  const next = await rpc("admit", input);
  expect(next.id).not.toBe(old.id);
  expect(next.generation_id).not.toBe(old.generation_id);
  const retained = (
    await db.query<any>(
      "select reserved_usd,state,fingerprint from listing_photo_jobs where id=$1",
      [old.id],
    )
  ).rows[0];
  expect(Number(retained.reserved_usd)).toBe(0.2);
  expect(retained.state).toBe("cancelled");
  expect(retained.fingerprint).toContain(old.id);
  const reservations = (
    await db.query<any>(
      "select id,status from photo_test_reservations where id=ANY($1::uuid[])",
      [[old.generation_id, next.generation_id]],
    )
  ).rows;
  expect(reservations.find((r) => r.id === old.generation_id).status).toBe(
    "refunded",
  );
  expect(reservations.find((r) => r.id === next.generation_id).status).toBe(
    "pending",
  );
  expect((await rpc("admit", input)).id).toBe(next.id);
});
