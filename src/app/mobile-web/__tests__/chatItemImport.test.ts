import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalDraftStore } from "../localDraftStore";
import { DEFAULT_DRAFT_SETTINGS } from "../draftContracts";
import {
  listenForChatItem,
  PRIVATE_PLUGIN_ORIGIN,
  saveChatItem,
} from "../chatItemImport";

const auth = vi.hoisted(() => ({ owner: "alice" as string | null }));
const image = vi.hoisted(() => ({ before: async () => {} }));
vi.mock("../auth", () => ({
  getBrowserSession: async () =>
    auth.owner ? { user: { id: auth.owner } } : null,
}));
vi.mock("../imagePreparation", () => ({
  prepareMobileImage: async (file: File) => {
    await image.before();
    return { file, previewUrl: URL.createObjectURL(file) };
  },
}));
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  };
};
const item = () => ({
  id: crypto.randomUUID(),
  title: "Beige embroidered top",
  description: "Round neckline.",
  photos: [
    new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }),
  ],
});
const settings = {
  ...DEFAULT_DRAFT_SETTINGS,
  includeSellerNote: true,
  descriptionFooterText: "Alice's saved note",
};
beforeEach(async () => {
  const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
  auth.owner = "alice";
  image.before = async () => {};
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("navigator", {});
});
afterEach(() => vi.unstubAllGlobals());
const drafts = async (owner: string) => {
  const store = new LocalDraftStore(owner);
  try {
    return (await store.list()).drafts;
  } finally {
    store.dispose();
  }
};
it.each(["bob", null])(
  "rejects import when the browser account is %s instead of the captured owner",
  async (owner) => {
    auth.owner = owner;
    await expect(saveChatItem("alice", item(), settings)).rejects.toThrow(
      /account|sign in/i,
    );
    expect(await drafts("alice")).toEqual([]);
    expect(await drafts("bob")).toEqual([]);
  },
);
it("rejects an account switch during image processing before persisting photos or the seller note", async () => {
  image.before = async () => {
    auth.owner = "bob";
  };
  await expect(saveChatItem("alice", item(), settings)).rejects.toThrow(
    /account/i,
  );
  expect(await drafts("alice")).toEqual([]);
  expect(await drafts("bob")).toEqual([]);
});
it("keeps owners separate, applies each owner's note once and preserves edits on repeated imports", async () => {
  const value = item();
  await saveChatItem("alice", value, settings);
  const store = new LocalDraftStore("alice");
  const a = await store.action("detail", { draftId: value.id });
  expect(a.description).toBe("Round neckline.\n\nAlice's saved note");
  await store.action("save", {
    draftId: value.id,
    expectedVersion: a.version,
    title: "My edited title",
  });
  await saveChatItem("alice", value, settings);
  expect((await store.action("detail", { draftId: value.id })).title).toBe(
    "My edited title",
  );
  auth.owner = "bob";
  expect(await drafts("bob")).toEqual([]);
  await saveChatItem("bob", value, {
    ...settings,
    descriptionFooterText: "Bob's saved note",
  });
  const b = new LocalDraftStore("bob");
  expect((await b.action("detail", { draftId: value.id })).description).toBe(
    "Round neckline.\n\nBob's saved note",
  );
  expect(
    (await store.action("detail", { draftId: value.id })).description,
  ).not.toContain("Bob");
  b.dispose();
  store.dispose();
});
function receiver(sameOrigin = false) {
  const messages: any[] = [];
  const sender = {
    location: sameOrigin ? { origin: "https://autolister.app" } : undefined,
    postMessage: (data: unknown) => messages.push(data),
  };
  let listener: ((e: any) => Promise<void>) | undefined;
  vi.stubGlobal("window", {
    opener: sender,
    addEventListener: (_: string, fn: any) => {
      listener = fn;
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal("location", {
    hash: "#import-chatgpt-item",
    pathname: "/app/",
    search: "",
    origin: "https://autolister.app",
  });
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
  const opened = vi.fn(),
    error = vi.fn(),
    defaults = vi.fn(async () => settings);
  const dispose = listenForChatItem("alice", defaults, opened, error);
  const send = (overrides = {}) =>
    listener!({
      source: sender,
      origin: PRIVATE_PLUGIN_ORIGIN,
      data: { type: "autolister.item", nonce: messages[0].nonce, item: item() },
      ...overrides,
    });
  return { send, dispose, opened, error, defaults, messages };
}
it("rejects a same-origin handoff for another account before reading notes", async () => {
  const r = receiver(true);
  await r.send({
    origin: "https://autolister.app",
    data: {
      type: "autolister.item",
      nonce: r.messages[0].nonce,
      item: { ...item(), owner: "bob" },
    },
  });
  expect(r.defaults).not.toHaveBeenCalled();
  expect(r.opened).not.toHaveBeenCalled();
  expect(r.error).toHaveBeenCalledWith(
    "This draft belongs to another account.",
  );
});
it("opens a same-origin handoff only for its matching account", async () => {
  const r = receiver(true);
  const value = { ...item(), owner: "alice" };
  await r.send({
    origin: "https://autolister.app",
    data: { type: "autolister.item", nonce: r.messages[0].nonce, item: value },
  });
  expect(r.opened).toHaveBeenCalledWith(value.id);
});
it("ignores wrong origin, window and nonce without reading saved notes", async () => {
  const r = receiver();
  await r.send({ origin: "https://evil.example" });
  await r.send({ source: {} });
  await r.send({
    data: { type: "autolister.item", nonce: "wrong", item: item() },
  });
  expect(r.defaults).not.toHaveBeenCalled();
  expect(await drafts("alice")).toEqual([]);
  r.dispose();
});
it("checks the active account before reading the old owner's notes", async () => {
  const r = receiver();
  auth.owner = "bob";
  await r.send();
  expect(r.defaults).not.toHaveBeenCalled();
  expect(r.opened).not.toHaveBeenCalled();
  expect(r.error).toHaveBeenCalled();
  r.dispose();
});
it("does not save or acknowledge a handoff disposed while processing an image", async () => {
  const r = receiver();
  image.before = async () => r.dispose();
  await r.send();
  expect(await drafts("alice")).toEqual([]);
  expect(r.opened).not.toHaveBeenCalled();
  expect(r.messages.map((m) => m.type)).toEqual(["autolister.ready"]);
});
it("does not acknowledge a handoff disposed while opening the saved draft", async () => {
  const r = receiver();
  r.opened.mockImplementation(async () => r.dispose());
  await r.send();
  expect(r.messages.map((m) => m.type)).toEqual(["autolister.ready"]);
});
