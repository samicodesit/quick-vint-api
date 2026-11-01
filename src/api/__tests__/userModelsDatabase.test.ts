import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const owner = randomUUID();
const input = {
  preferences: {
    gender: "female",
    hair: "brown",
    heightCm: 170,
    build: "average",
    skinTone: "tone_3",
  },
  seed: "seed",
  scene: {},
  fingerprint: "hash",
  promptVersion: 1,
  catalogVersion: 1,
};
async function mutate(
  action: string,
  value: object = {},
  user = owner,
): Promise<any> {
  return (
    await db.query<any>("SELECT user_model_mutate($1,$2,$3::jsonb) result", [
      user,
      action,
      JSON.stringify(value),
    ])
  ).rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.query("INSERT INTO auth.users VALUES ($1)", [owner]);
  await db.exec(readFileSync("migrations/2026-11-01_user_models.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("account model lifecycle in Postgres", () => {
  it("does not expose private model tables or mutation RPCs to browser roles", async () => {
    await db.exec("SET ROLE authenticated");
    await expect(db.query("SELECT * FROM user_models")).rejects.toThrow(
      /permission denied/,
    );
    await expect(mutate("create", input)).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
  it("ends overdue operations and caps repeated paid failures across operations", async () => {
    const user = randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1)", [user]);
    let model = await mutate("create", input, user);
    for (let operation = 0; operation < 3; operation++) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const job = await mutate(
          "claim",
          { operationId: model.operation_id },
          user,
        );
        expect(job).not.toBeNull();
        model = await mutate(
          "fail",
          {
            operationId: model.operation_id,
            lease: job.lease_token,
            errorCode: "provider_failed",
          },
          user,
        );
      }
      expect(model.state).toBe("failed");
      await db.query(
        "UPDATE user_models SET updated_at=now()-interval '31 seconds' WHERE user_id=$1",
        [user],
      );
      if (operation < 2) model = await mutate("retry", {}, user);
    }
    await expect(mutate("retry", {}, user)).rejects.toThrow(
      /model_retry_limit/,
    );
    expect((await mutate("get", {}, user)).model.total_attempts).toBe(6);
    const overdue = randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1)", [overdue]);
    const queued = await mutate("create", input, overdue);
    await db.query(
      "UPDATE user_models SET operation_deadline=now()-interval '1 second' WHERE user_id=$1",
      [overdue],
    );
    expect(
      await mutate("claim", { operationId: queued.operation_id }, overdue),
    ).toBeNull();
    expect((await mutate("get", {}, overdue)).model.state).toBe("failed");
  });
  it("claims a shared invitation once", async () => {
    expect((await mutate("invite")).claimed).toBe(true);
    expect((await mutate("invite")).claimed).toBe(false);
    await mutate("dismiss");
  });
  it("serializes creation, fences workers and keeps ready models immutable", async () => {
    const [a, b] = await Promise.all([
      mutate("create", input),
      mutate("create", { ...input, seed: "other" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.seed).toBe("seed");
    const job = await mutate("claim", { operationId: a.operation_id });
    expect(job.attempt_count).toBe(1);
    expect(await mutate("claim", { operationId: a.operation_id })).toBeNull();
    expect(
      await mutate("finish", {
        operationId: a.operation_id,
        lease: randomUUID(),
      }),
    ).toBeNull();
    await mutate("fail", {
      operationId: a.operation_id,
      lease: job.lease_token,
      errorCode: "quality_failed",
      metrics: { durationMs: 123 },
    });
    const retry = await mutate("claim", { operationId: a.operation_id });
    expect(retry.attempt_count).toBe(2);
    expect(retry.scene).toEqual(job.scene);
    expect(
      await mutate("finish", {
        operationId: a.operation_id,
        lease: job.lease_token,
      }),
    ).toBeNull();
    const ready = await mutate("finish", {
      operationId: a.operation_id,
      lease: retry.lease_token,
      metrics: { estimatedCostUsd: 0.014 },
    });
    expect(ready.state).toBe("ready");
    expect(ready.object_key).toContain("/2.jpg");
    expect((await mutate("create", { ...input, seed: "changed" })).seed).toBe(
      "seed",
    );
    expect((await mutate("retry")).operation_id).toBe(a.operation_id);
    await mutate("enable", { enabled: false });
    expect((await mutate("get")).model.object_key).toBe(ready.object_key);
    expect((await mutate("get")).enabled).toBe(false);
  });
  it("bounds lost workers and failed retries; deletion fences all outstanding writes", async () => {
    const user = randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1)", [user]);
    const model = await mutate("create", input, user);
    const job = await mutate(
      "claim",
      { operationId: model.operation_id },
      user,
    );
    await db.query(
      "UPDATE user_models SET lease_until=now()-interval '1 second' WHERE user_id=$1",
      [user],
    );
    const recovered = await mutate(
      "claim",
      { operationId: model.operation_id },
      user,
    );
    expect(recovered.attempt_count).toBe(2);
    expect(
      await mutate(
        "finish",
        { operationId: model.operation_id, lease: job.lease_token },
        user,
      ),
    ).toBeNull();
    await mutate(
      "fail",
      {
        operationId: model.operation_id,
        lease: recovered.lease_token,
        errorCode: "provider_failed",
      },
      user,
    );
    expect((await mutate("get", {}, user)).model.state).toBe("failed");
    await mutate("erase", {}, user);
    await expect(mutate("retry", {}, user)).rejects.toThrow(/model_erasing/);
    expect(
      await mutate(
        "finish",
        { operationId: model.operation_id, lease: recovered.lease_token },
        user,
      ),
    ).toBeNull();
    await db.query("DELETE FROM auth.users WHERE id=$1", [user]);
    expect(
      (
        await db.query<any>(
          "SELECT user_id FROM user_model_attempts WHERE operation_id=$1",
          [model.operation_id],
        )
      ).rows.every((r) => r.user_id === null),
    ).toBe(true);
  });
});
