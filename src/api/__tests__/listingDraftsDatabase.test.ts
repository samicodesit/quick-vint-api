import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const owner = "123e4567-e89b-42d3-a456-426614174000";
const other = "123e4567-e89b-42d3-a456-426614174001";
const settings = {
  titleLanguageCode: "en",
  descriptionLanguageCode: "fr",
  descriptionLength: "long",
  useBulletPoints: true,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE generation_reservations(id uuid PRIMARY KEY,user_id uuid,status text); CREATE TABLE mobile_generation_idempotency(id uuid PRIMARY KEY,user_id uuid,request_id uuid,request_hash text,attempt_id uuid,status text,response_status integer,reservation_id uuid,response_json jsonb,commit_pending boolean,expires_at timestamptz,updated_at timestamptz); ",
  );
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [owner, other]);
  await db.exec(
    readFileSync("migrations/2026-10-09_listing_drafts.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function mutate(
  action: string,
  input: Record<string, unknown>,
  user = owner,
): Promise<any> {
  return (
    await db.query<any>(
      "SELECT listing_draft_mutate($1,$2,$3::jsonb) AS result",
      [user, action, JSON.stringify(input)],
    )
  ).rows[0].result;
}
async function photo(draftId?: string) {
  const id = randomUUID();
  await mutate("grant", {
    photoId: id,
    importId: randomUUID(),
    draftId,
    bytes: 123,
  });
  await mutate("completeUpload", {
    photoId: id,
    bytes: 123,
    digest: "a".repeat(64),
  });
  return id;
}
describe("private persistent listing drafts", () => {
  it("fences abandoned uploads before cleanup and leaves renewed uploads untouched", async () => {
    const id = randomUUID();
    const importId = randomUUID();
    const grant = { photoId: id, importId, bytes: 123 };
    await mutate("grant", grant);
    await db.query(
      "UPDATE listing_draft_photos SET grant_expires_at=now()-interval '28 hours' WHERE id=$1",
      [id],
    );
    await mutate("grant", grant);
    expect(
      await mutate("expireUpload", {
        photoId: id,
        cutoff: new Date(Date.now() - 86400000).toISOString(),
      }),
    ).toBeNull();
    await db.query(
      "UPDATE listing_draft_photos SET grant_expires_at=now()-interval '28 hours' WHERE id=$1",
      [id],
    );
    const expired = await mutate("expireUpload", {
      photoId: id,
      cutoff: new Date(Date.now() - 86400000).toISOString(),
    });
    expect(expired.deleted_at).toBeTruthy();
    expect(Date.parse(expired.grant_expires_at)).toBeGreaterThan(Date.now());
    await expect(mutate("grant", grant)).rejects.toThrow(/photo_conflict/);
    await expect(
      mutate("completeUpload", {
        photoId: id,
        bytes: 123,
        digest: "a".repeat(64),
      }),
    ).rejects.toThrow(/photo_not_found/);
  });
  it("creates owned drafts and enforces stale-save and foreign-owner denial", async () => {
    const draft = await mutate("create", { settings });
    expect(draft).toMatchObject({
      user_id: owner,
      version: 1,
      title: "",
      state: "draft",
    });
    const saved = await mutate("save", {
      draftId: draft.id,
      expectedVersion: 1,
      title: "Blue shirt",
      description: "Cotton shirt",
    });
    expect(saved.version).toBe(2);
    await expect(
      mutate("save", {
        draftId: draft.id,
        expectedVersion: 1,
        title: "Stale overwrite",
      }),
    ).rejects.toThrow(/draft_conflict/);
    await expect(
      mutate(
        "save",
        { draftId: draft.id, expectedVersion: 2, title: "Foreign overwrite" },
        other,
      ),
    ).rejects.toThrow(/draft_not_found/);
  });
  it("retains ungrouped imports and moves photos atomically with source versions", async () => {
    const id = await photo();
    const first = await mutate("create", { settings, photoIds: [id] });
    const second = await mutate("create", { settings });
    await expect(
      mutate("group", {
        draftId: second.id,
        expectedVersion: second.version,
        photoIds: [id],
        sourceVersions: {},
      }),
    ).rejects.toThrow(/draft_conflict/);
    await mutate("group", {
      draftId: second.id,
      expectedVersion: second.version,
      photoIds: [id],
      sourceVersions: { [first.id]: first.version },
    });
    expect(
      (
        await db.query<any>(
          "SELECT draft_id FROM listing_draft_photos WHERE id=$1",
          [id],
        )
      ).rows[0].draft_id,
    ).toBe(second.id);
    const loaded = (
      await db.query<any>("SELECT version FROM listing_drafts WHERE id=$1", [
        second.id,
      ])
    ).rows[0];
    await mutate("group", {
      draftId: second.id,
      expectedVersion: loaded.version,
      photoIds: [],
    });
    expect(
      (
        await db.query<any>(
          "SELECT draft_id,status FROM listing_draft_photos WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ draft_id: null, status: "ready" });
  });
  it("reserves upload capacity and rejects cross-owner grouping and too many item photos", async () => {
    const foreign = await mutate("create", { settings }, other);
    await expect(
      mutate("grant", {
        photoId: randomUUID(),
        importId: randomUUID(),
        draftId: foreign.id,
        bytes: 100,
      }),
    ).rejects.toThrow(/draft_not_found/);
    const draft = await mutate("create", { settings });
    for (let i = 0; i < 10; i++)
      await mutate("grant", {
        photoId: randomUUID(),
        importId: randomUUID(),
        draftId: draft.id,
        bytes: 100,
      });
    await expect(
      mutate("grant", {
        photoId: randomUUID(),
        importId: randomUUID(),
        draftId: draft.id,
        bytes: 100,
      }),
    ).rejects.toThrow(/photo_limit/);
    await expect(
      mutate("grant", {
        photoId: randomUUID(),
        importId: randomUUID(),
        bytes: 4194305,
      }),
    ).rejects.toThrow(/photo_size/);
  });
  it("serializes generation claims and saves pending output before a verified completion", async () => {
    let draft = await mutate("create", { settings });
    await photo(draft.id);
    draft = (
      await db.query<any>("SELECT * FROM listing_drafts WHERE id=$1", [
        draft.id,
      ])
    ).rows[0];
    const operationId = randomUUID();
    const claim = await mutate("claim", {
      draftId: draft.id,
      inputVersion: draft.input_version,
      operationId,
    });
    expect(claim.operation_id).toBe(operationId);
    await expect(
      mutate("claim", {
        draftId: draft.id,
        inputVersion: draft.input_version,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/generation_in_progress/);
    await expect(
      mutate("save", {
        draftId: draft.id,
        expectedVersion: claim.version,
        title: "Edit while running",
      }),
    ).rejects.toThrow(/generation_in_progress/);
    const reservationId = randomUUID();
    await db.query(
      "INSERT INTO generation_reservations VALUES ($1,$2,'pending')",
      [reservationId, owner],
    );
    await mutate("bind", { draftId: draft.id, operationId, reservationId });
    await mutate("pending", {
      draftId: draft.id,
      operationId,
      reservationId,
      result: { title: "Generated", description: "Saved cotton shirt" },
    });
    await expect(
      mutate("complete", { draftId: draft.id, operationId }),
    ).rejects.toThrow(/generation_commit_pending/);
    await db.query(
      "UPDATE generation_reservations SET status='committed' WHERE id=$1",
      [reservationId],
    );
    const completed = await mutate("complete", {
      draftId: draft.id,
      operationId,
    });
    expect(completed).toMatchObject({
      title: "Generated",
      description: "Saved cotton shirt",
      operation_state: "succeeded",
      pending_result: null,
    });
    expect(
      (await mutate("complete", { draftId: draft.id, operationId })).title,
    ).toBe("Generated");
  });
  it("does not resurrect deleted drafts or expose tables to browser roles", async () => {
    let draft = await mutate("create", { settings });
    draft = await mutate("save", {
      draftId: draft.id,
      expectedVersion: draft.version,
      title: "Private title",
      description: "Private description",
    });
    const deleted = await mutate("delete", {
      draftId: draft.id,
      expectedVersion: draft.version,
    });
    expect(deleted).toMatchObject({
      title: "",
      description: "",
      pending_result: null,
    });
    await expect(
      mutate("claim", {
        draftId: draft.id,
        inputVersion: 1,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/draft_not_found/);
    await db.exec("SET ROLE authenticated");
    try {
      await expect(db.query("SELECT * FROM listing_drafts")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query<any>(
          "SELECT public FROM storage.buckets WHERE id='listing-drafts'",
        )
      ).rows[0].public,
    ).toBe(false);
  });
  it("retains anonymous cleanup tombstones after account erasure", async () => {
    const erased = randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1)", [erased]);
    const draft = await mutate("create", { settings }, erased);
    const photoId = randomUUID();
    await mutate(
      "grant",
      { photoId, importId: randomUUID(), draftId: draft.id, bytes: 100 },
      erased,
    );
    await db.query("DELETE FROM auth.users WHERE id=$1", [erased]);
    expect(
      (
        await db.query<any>(
          "SELECT user_id,draft_id,object_key FROM listing_draft_photos WHERE id=$1",
          [photoId],
        )
      ).rows[0],
    ).toMatchObject({ user_id: null, draft_id: null });
    expect(
      (await db.query("SELECT * FROM listing_drafts WHERE id=$1", [draft.id]))
        .rows,
    ).toHaveLength(0);
  });
  it("enforces account storage, import and retained draft limits inside the transaction", async () => {
    const account = randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1)", [account]);
    await db.query(
      "INSERT INTO listing_drafts(user_id,settings) SELECT $1,$2::jsonb FROM generate_series(1,500)",
      [account, JSON.stringify(settings)],
    );
    await expect(mutate("create", { settings }, account)).rejects.toThrow(
      /draft_limit/,
    );
    const importId = randomUUID();
    await db.query(
      "INSERT INTO listing_draft_photos(id,user_id,import_id,object_key,bytes) SELECT gen_random_uuid(),$1,$2,'capacity/'||gen_random_uuid(),4194304 FROM generate_series(1,128)",
      [account, importId],
    );
    await expect(
      mutate(
        "grant",
        { photoId: randomUUID(), importId: randomUUID(), bytes: 6 },
        account,
      ),
    ).rejects.toThrow(/storage_limit/);
    await db.query("DELETE FROM listing_draft_photos WHERE user_id=$1", [
      account,
    ]);
    await db.query(
      "INSERT INTO listing_draft_photos(id,user_id,import_id,object_key,bytes) SELECT gen_random_uuid(),$1,$2,'import/'||gen_random_uuid(),6 FROM generate_series(1,100)",
      [account, importId],
    );
    await expect(
      mutate("grant", { photoId: randomUUID(), importId, bytes: 6 }, account),
    ).rejects.toThrow(/import_limit/);
  });
  it("recovers durable output after ordinary replay expiry and rejects stale generation inputs", async () => {
    let draft = await mutate("create", { settings });
    await photo(draft.id);
    draft = (
      await db.query<any>("SELECT * FROM listing_drafts WHERE id=$1", [
        draft.id,
      ])
    ).rows[0];
    const operationId = randomUUID(),
      reservationId = randomUUID();
    const claim = await mutate("claim", {
      draftId: draft.id,
      inputVersion: draft.input_version,
      operationId,
    });
    await db.query(
      "INSERT INTO generation_reservations VALUES ($1,$2,'committed')",
      [reservationId, owner],
    );
    await db.query(
      "INSERT INTO mobile_generation_idempotency(id,user_id,request_id,status,reservation_id,response_json,commit_pending,expires_at) VALUES ($1,$2,$3,'in_progress',$4,$5::jsonb,true,now()-interval '1 day')",
      [
        randomUUID(),
        owner,
        operationId,
        reservationId,
        JSON.stringify({
          title: "Recovered after expiry",
          description: "Already generated",
        }),
      ],
    );
    const recovered = await mutate("recover", { draftId: draft.id });
    expect(recovered.operation_state).toBe("pending");
    const complete = await mutate("complete", {
      draftId: draft.id,
      operationId,
    });
    expect(complete.title).toBe("Recovered after expiry");
    expect(
      (
        await mutate("claim", {
          draftId: draft.id,
          inputVersion: draft.input_version,
          operationId,
        })
      )._claimed,
    ).toBe(false);
    await expect(
      mutate("claim", {
        draftId: draft.id,
        inputVersion: draft.input_version,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/draft_conflict/);
    expect(claim.input_version).toBe(draft.input_version + 1);
  });
  it("unlocks a definitively failed uncharged operation immediately", async () => {
    let draft = await mutate("create", { settings });
    await photo(draft.id);
    draft = (
      await db.query<any>("SELECT * FROM listing_drafts WHERE id=$1", [
        draft.id,
      ])
    ).rows[0];
    const operationId = randomUUID();
    await mutate("claim", {
      draftId: draft.id,
      inputVersion: draft.input_version,
      operationId,
    });
    await db.query(
      "INSERT INTO mobile_generation_idempotency(id,user_id,request_id,status,commit_pending) VALUES ($1,$2,$3,'failed',false)",
      [randomUUID(), owner, operationId],
    );
    expect(
      (await mutate("recover", { draftId: draft.id })).operation_state,
    ).toBe("failed");
  });
});
