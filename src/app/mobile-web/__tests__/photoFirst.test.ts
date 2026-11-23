import { beforeEach, expect, it, vi } from "vitest";
import { assignPhotoFirst, photoFirstWindowOpen } from "../photoFirstFlags";
import {
  addPendingPhotos,
  beginPhotoFirstSignIn,
  claimPhotoFirstSignIn,
  importPhotoFirstDraft,
  pendingPhotoFirst,
  setPhotoFirstAuth,
} from "../photoFirstStorage";
import { DEFAULT_DRAFT_SETTINGS } from "../draftContracts";
import { LocalDraftStore } from "../localDraftStore";

const jpeg = () => ({
  id: crypto.randomUUID(),
  blob: new Blob(["jpeg"], { type: "image/jpeg" }),
});
beforeEach(async () => {
  const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  const makeStore = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    };
  };
  vi.stubGlobal("localStorage", makeStore());
  vi.stubGlobal("sessionStorage", makeStore());
});

it("splits a stable set of browser IDs 50/50 and closes enrollment after seven days", () => {
  const start = "2026-11-24T12:00:00Z";
  const at = Date.parse(start);
  expect(photoFirstWindowOpen(start, at - 1)).toBe(false);
  expect(photoFirstWindowOpen(start, at)).toBe(true);
  expect(photoFirstWindowOpen(start, at + 7 * 86400000)).toBe(false);
  const arms = [..."0123456789abcdef"].map((n) =>
    assignPhotoFirst(`123e4567-e89b-42d3-a456-42661417400${n}`),
  );
  expect(arms.filter((value) => value === "photo_first")).toHaveLength(8);
  expect(arms.filter((value) => value === "control")).toHaveLength(8);
  expect(assignPhotoFirst("")).toBe(null);
});

it("binds an email handoff to the verified email and imports only once for that account", async () => {
  const first = jpeg();
  const second = jpeg();
  const item = await addPendingPhotos([first, second]);
  await beginPhotoFirstSignIn(item.id);
  await setPhotoFirstAuth("email", "SAME@example.test");
  expect(
    await claimPhotoFirstSignIn(
      { id: "wrong", email: "other@example.test" },
      "email",
    ),
  ).toBe(false);
  expect(
    await claimPhotoFirstSignIn(
      { id: "right", email: "same@example.test" },
      "email",
    ),
  ).toBe(true);
  expect(
    await claimPhotoFirstSignIn(
      { id: "wrong", email: "same@example.test" },
      "email",
    ),
  ).toBe(false);
  expect(await importPhotoFirstDraft("wrong", DEFAULT_DRAFT_SETTINGS)).toBe(
    null,
  );
  const imported = await Promise.all([
    importPhotoFirstDraft("right", DEFAULT_DRAFT_SETTINGS),
    importPhotoFirstDraft("right", DEFAULT_DRAFT_SETTINGS),
  ]);
  expect(imported.filter((result) => result?.autoGenerate)).toHaveLength(1);
  const library = await new LocalDraftStore("right").list();
  expect(library.drafts).toHaveLength(1);
  expect(library.drafts[0].id).toBe(item.id);
  expect(library.drafts[0].photos.map(({ id }) => id)).toEqual([
    first.id,
    second.id,
  ]);
  expect((await pendingPhotoFirst())?.photos).toEqual([]);
});

it("claims Google only from the tab that started the redirect", async () => {
  const item = await addPendingPhotos([jpeg()]);
  await beginPhotoFirstSignIn(item.id);
  await setPhotoFirstAuth("google");
  const originalTab = sessionStorage;
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    removeItem: () => {},
  });
  expect(await claimPhotoFirstSignIn({ id: "unrelated" }, "callback")).toBe(
    false,
  );
  vi.stubGlobal("sessionStorage", originalTab);
  expect(await claimPhotoFirstSignIn({ id: "seller" }, "callback")).toBe(true);
  expect((await pendingPhotoFirst())?.owner).toBe("seller");
});
