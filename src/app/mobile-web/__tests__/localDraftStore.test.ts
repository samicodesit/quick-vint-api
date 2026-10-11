import { beforeEach, expect, it, vi } from "vitest";
import { LocalDraftStore } from "../localDraftStore";
import { DEFAULT_DRAFT_SETTINGS } from "../draftContracts";

let first: LocalDraftStore;
const id = () => crypto.randomUUID();
const jpeg = () =>
  new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" });
beforeEach(async () => {
  const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  first = new LocalDraftStore("account-one");
});
const create = (store = first, photoIds: string[] = []) =>
  store.action("create", {
    id: id(),
    settings: DEFAULT_DRAFT_SETTINGS,
    photoIds,
  });
const photo = async (draftId?: string) => {
  const photoId = id();
  return first.upload(jpeg(), {
    photoId,
    importId: id(),
    ...(draftId ? { draftId } : {}),
  });
};

it("persists JPEGs and edits across connections while isolating accounts", async () => {
  let draft = await create();
  const p = await photo(draft.id);
  draft = await first.action("detail", { draftId: draft.id });
  await first.action("save", {
    draftId: draft.id,
    expectedVersion: draft.version,
    title: "Dress",
    description: "Details",
  });
  first.dispose();
  const reopened = new LocalDraftStore("account-one");
  const saved = await reopened.action("detail", { draftId: draft.id });
  expect(saved.title).toBe("Dress");
  expect(saved.photos[0].url).toMatch(/^blob:/);
  expect(await (await reopened.photoFiles([p.id]))[0].arrayBuffer()).toEqual(
    await jpeg().arrayBuffer(),
  );
  expect((await new LocalDraftStore("account-two").list()).drafts).toEqual([]);
});

it("serializes conflicting saves from different tabs without losing the first edit", async () => {
  const draft = await create();
  const other = new LocalDraftStore("account-one");
  const input = { draftId: draft.id, expectedVersion: draft.version };
  const results = await Promise.allSettled([
    first.action("save", { ...input, title: "First" }),
    other.action("save", { ...input, title: "Second" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "draft_conflict" },
  });
});

it("groups and reorders photos atomically and checks source versions", async () => {
  const a = await photo();
  const b = await photo();
  const source = await create(first, [a.id, b.id]);
  const target = await create();
  await expect(
    first.action("group", {
      draftId: target.id,
      expectedVersion: target.version,
      photoIds: [b.id],
      sourceVersions: {},
    }),
  ).rejects.toMatchObject({ code: "draft_conflict" });
  expect(
    (await first.action("detail", { draftId: source.id })).photos,
  ).toHaveLength(2);
  await first.action("group", {
    draftId: target.id,
    expectedVersion: target.version,
    photoIds: [b.id],
    sourceVersions: { [source.id]: source.version },
  });
  expect(
    (await first.action("detail", { draftId: source.id })).photos.map(
      (p) => p.id,
    ),
  ).toEqual([a.id]);
  expect(
    (await first.action("detail", { draftId: target.id })).photos.map(
      (p) => p.id,
    ),
  ).toEqual([b.id]);
});

it("removes only the requested photo and releases all blobs when deleting an item", async () => {
  const draft = await create();
  const a = await photo(draft.id);
  const b = await photo(draft.id);
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  await first.action("removePhoto", { photoId: b.id });
  const saved = await first.action("detail", { draftId: draft.id });
  expect(saved.photos.map((p) => p.id)).toEqual([a.id]);
  await expect(first.photoFiles([b.id])).rejects.toMatchObject({
    code: "photo_not_found",
  });
  await first.action("delete", {
    draftId: draft.id,
    expectedVersion: saved.version,
  });
  expect((await first.list()).drafts).toEqual([]);
  await expect(first.photoFiles([a.id])).rejects.toMatchObject({
    code: "photo_not_found",
  });
  expect(revoke).toHaveBeenCalledWith(b.url);
});

it("keeps the ten-photo limit and refuses edits during an uncertain generation", async () => {
  const draft = await create();
  for (let i = 0; i < 10; i++) await photo(draft.id);
  await expect(photo(draft.id)).rejects.toMatchObject({ code: "photo_limit" });
  const current = await first.action("detail", { draftId: draft.id });
  await first.beginAttempt(
    current.id,
    { operationId: id(), inputVersion: current.input_version },
    false,
  );
  await expect(
    first.action("save", {
      draftId: current.id,
      expectedVersion: current.version + 1,
      title: "Changed",
    }),
  ).rejects.toMatchObject({ code: "generation_in_progress" });
});

it("fails explicitly when durable browser storage is unavailable", async () => {
  vi.stubGlobal("indexedDB", undefined);
  await expect(new LocalDraftStore("account-one").list()).rejects.toMatchObject(
    { code: "local_storage_unavailable" },
  );
});

it("rolls back a failed storage write instead of acknowledging unsaved text", async () => {
  const draft = await create();
  const { IDBObjectStore } = await import("fake-indexeddb");
  const original = IDBObjectStore.prototype.put;
  const fault = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (
      this: InstanceType<typeof IDBObjectStore>,
      value,
      key,
    ) {
      if (value?.title === "Unsaved")
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, value, key);
    });
  await expect(
    first.action("save", {
      draftId: draft.id,
      expectedVersion: draft.version,
      title: "Unsaved",
    }),
  ).rejects.toMatchObject({ code: "storage_limit" });
  fault.mockRestore();
  const saved = await first.action("detail", { draftId: draft.id });
  expect(saved.title).toBe("");
  expect(saved.version).toBe(draft.version);
});

it("allows only one generation claim across two tabs", async () => {
  const draft = await create();
  await photo(draft.id);
  const current = await first.action("detail", { draftId: draft.id });
  const second = new LocalDraftStore("account-one");
  const results = await Promise.allSettled([
    first.beginAttempt(
      draft.id,
      { operationId: id(), inputVersion: current.input_version },
      false,
    ),
    second.beginAttempt(
      draft.id,
      { operationId: id(), inputVersion: current.input_version },
      false,
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "generation_in_progress" },
  });
});

it("pages the library and saves one item without scanning unrelated draft text", async () => {
  const { IDBObjectStore } = await import("fake-indexeddb");
  const original = IDBObjectStore.prototype.getAll;
  const guard = vi
    .spyOn(IDBObjectStore.prototype, "getAll")
    .mockImplementation(function (
      this: InstanceType<typeof IDBObjectStore>,
      ...args
    ) {
      if (this.name === "drafts")
        throw new Error("An item operation must not load every draft");
      return original.apply(this, args);
    });
  for (let i = 0; i < 35; i++) await create();
  const page = await first.list();
  expect(page.drafts).toHaveLength(30);
  const more = await first.list("draft", page.nextCursor!);
  expect(more.drafts).toHaveLength(5);
  expect(new Set([...page.drafts, ...more.drafts].map((d) => d.id)).size).toBe(
    35,
  );
  const draft = page.drafts[0];
  await first.action("save", {
    draftId: draft.id,
    expectedVersion: draft.version,
    description: "Details",
  });
  expect(
    (await first.action("detail", { draftId: draft.id })).description,
  ).toBe("Details");
  guard.mockRestore();
});

it("adds efficient indexes to older local storage without losing saved JPEGs", async () => {
  const draftId = id();
  const photoId = id();
  const now = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("autolister:drafts:v1:account-one", 1);
    opening.onupgradeneeded = () => {
      for (const store of ["drafts", "photos", "blobs", "attempts"])
        opening.result.createObjectStore(store, {
          keyPath: store === "attempts" ? "draftId" : "id",
        });
      opening.transaction!.objectStore("drafts").add({
        id: draftId,
        title: "Saved",
        description: "Details",
        settings: DEFAULT_DRAFT_SETTINGS,
        state: "draft",
        version: 1,
        input_version: 1,
        operation_id: null,
        operation_state: "idle",
        created_at: now,
        updated_at: now,
      });
      opening.transaction!.objectStore("photos").add({
        id: photoId,
        import_id: id(),
        draft_id: draftId,
        position: 0,
        bytes: 4,
        status: "ready",
        created_at: now,
      });
      opening
        .transaction!.objectStore("blobs")
        .add({ id: photoId, blob: jpeg() });
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      opening.result.close();
      resolve();
    };
  });
  const draft = await first.action("detail", { draftId });
  expect(draft.title).toBe("Saved");
  expect(draft.photos.map((p) => p.id)).toEqual([photoId]);
  expect((await first.list()).drafts[0].description).toBe("Details");
});
