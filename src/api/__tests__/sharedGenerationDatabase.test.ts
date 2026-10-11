import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createGenerationDatabase,
  owner,
  other,
} from "./fixtures/generationDatabase";

let db: PGlite;
const hash = "a".repeat(64);
type Claim = {
  kind: string;
  recordId: string;
  attemptId: string;
  response?: unknown;
};
beforeAll(async () => {
  db = await createGenerationDatabase();
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function claim(
  requestId: string,
  client = "extension",
  userId = owner,
  requestHash = hash,
) {
  return (
    await db.query<{ result: Claim }>(
      "SELECT claim_mobile_generation_idempotency($1,$2,$3,$4) AS result",
      [userId, client, requestId, requestHash],
    )
  ).rows[0].result;
}
async function reserve(
  operation: Claim,
  requestId: string,
  client = "extension",
  tier = "pro",
) {
  return (
    await db.query<{
      result: { allowed: boolean; reservationId: string; code?: string };
    }>(
      "SELECT reserve_and_bind_mobile_generation_reservation($1,$2,$3,$4,$5,$6,'current',$7,500,50,20,5,false) AS result",
      [
        owner,
        operation.recordId,
        operation.attemptId,
        client,
        requestId,
        hash,
        tier,
      ],
    )
  ).rows[0].result;
}
it("replays the same extension operation with only one usage reservation", async () => {
  const requestId = randomUUID();
  const operation = await claim(requestId);
  expect(operation.kind).toBe("new");
  const reserved = await reserve(operation, requestId);
  expect(reserved.allowed).toBe(true);
  expect((await claim(requestId)).kind).toBe("in_progress");
  expect((await reserve(operation, requestId)).allowed).toBe(false);
  const response = JSON.stringify({
    title: "Dress",
    description: "Saved text",
  });
  await db.query(
    "SELECT mark_mobile_generation_commit_pending($1,$2,$3,$4::jsonb)",
    [operation.recordId, operation.attemptId, reserved.reservationId, response],
  );
  await db.query("SELECT commit_generation_reservation($1)", [
    reserved.reservationId,
  ]);
  await db.query(
    "SELECT complete_mobile_generation_idempotency($1,$2,$3::jsonb,200,$4)",
    [operation.recordId, operation.attemptId, response, reserved.reservationId],
  );
  expect(await claim(requestId)).toMatchObject({
    kind: "succeeded",
    response: JSON.parse(response),
  });
  expect(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM generation_reservations WHERE id=$1",
        [reserved.reservationId],
      )
    ).rows[0].count,
  ).toBe(1);
});
it("isolates accounts and clients and rejects changed payloads and wrong-client reservations", async () => {
  const requestId = randomUUID();
  const extension = await claim(requestId);
  const mobile = await claim(requestId, "mobile_web");
  const differentOwner = await claim(requestId, "extension", other);
  expect(
    new Set([extension.recordId, mobile.recordId, differentOwner.recordId])
      .size,
  ).toBe(3);
  expect(
    (await claim(requestId, "extension", owner, "b".repeat(64))).kind,
  ).toBe("conflict");
  expect((await reserve(extension, requestId, "mobile_web")).allowed).toBe(
    false,
  );
  expect((await reserve(mobile, requestId, "mobile_web")).allowed).toBe(true);
});
it("rolls back reservations on stale binding and preserves existing limit rejection", async () => {
  const requestId = randomUUID();
  const operation = await claim(requestId);
  expect(
    await reserve(operation, requestId, "extension", "deny"),
  ).toMatchObject({ allowed: false, code: "daily_limit" });
  const before = (
    await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM generation_reservations",
    )
  ).rows[0].count;
  await expect(
    reserve(operation, requestId, "extension", "wrong_owner"),
  ).rejects.toThrow("mobile_generation_attempt_stale");
  expect(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM generation_reservations",
      )
    ).rows[0].count,
  ).toBe(before);
});
it("cleans expired extension records without deleting active mobile operations", async () => {
  const requestId = randomUUID();
  const operation = await claim(requestId);
  const mobile = await claim(requestId, "mobile_web");
  await db.query(
    "UPDATE mobile_generation_idempotency SET expires_at=now()-interval '2 days' WHERE id=$1",
    [operation.recordId],
  );
  await db.query("SELECT cleanup_expired_mobile_generation_idempotency()");
  const rows = (
    await db.query<{ id: string }>(
      "SELECT id FROM mobile_generation_idempotency WHERE request_id=$1",
      [requestId],
    )
  ).rows;
  expect(rows).toEqual([{ id: mobile.recordId }]);
});
