import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { beforeAll, expect, it } from "vitest";
let IDBFactory: any;
beforeAll(async () => {
  IDBFactory = (await import("fake-indexeddb")).IDBFactory;
});

function browser(indexedDB: any, send: (body: any) => any) {
  const sandbox: any = {
    indexedDB,
    TextEncoder,
    AbortController,
    crypto: { randomUUID },
    location: new URL("https://autolister.app/phone-upload"),
    navigator: { userAgent: "Chrome" },
    document: { visibilityState: "visible" },
    addEventListener() {},
    setInterval() {},
    setTimeout,
    clearTimeout,
    console,
    fetch: async (_url: string, options: any) => send(JSON.parse(options.body)),
  };
  vm.createContext(sandbox);
  for (const name of ["registry", "core", "client", "website"])
    vm.runInContext(
      readFileSync(`public/telemetry-${name}.js`, "utf8"),
      sandbox,
    );
  return sandbox.AutoListerWebsiteTelemetry;
}

it("keeps offline evidence across page recreation and confirms only server acceptance", async () => {
  const indexedDB = new IDBFactory();
  let online = false;
  const received: any[] = [];
  const send = async (body: any) => {
    if (!online) throw new Error("offline");
    received.push(...body.events);
    return {
      status: 200,
      headers: new Headers(),
      json: async () => ({
        acknowledgedIds: body.events.map((event: any) => event.id),
      }),
    };
  };
  const first = browser(indexedDB, send);
  const result = await first.track(
    "fields_apply_failed",
    {
      context: {
        message: "Missing field",
        token: "secret",
        generatedDescription: "private",
      },
    },
    true,
  );
  expect(result.queued).toBe(true);
  expect(result.accepted).toBe(false);
  online = true;
  // Advance only the persisted retry schedule, not product state.
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open("autolister-telemetry", 1);
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    const request = store.get("state");
    request.onsuccess = () => {
      const state = request.result;
      for (const entry of state.events) entry.nextAt = 0;
      store.put(state, "state");
    };
    tx.oncomplete = () => resolve();
  });
  const second = browser(indexedDB, send);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await second.flush();
  expect(received).toHaveLength(1);
  expect(JSON.stringify(received)).not.toContain("secret");
  expect(JSON.stringify(received)).not.toContain("private");
});

it("serializes two website tabs without losing either queued event", async () => {
  const indexedDB = new IDBFactory();
  const send = async () => {
    throw new Error("offline");
  };
  const a = browser(indexedDB, send),
    b = browser(indexedDB, send);
  await Promise.all([
    a.track("fields_apply_failed", { context: { message: "first" } }, true),
    b.track("fields_apply_failed", { context: { message: "second" } }, true),
  ]);
  const state = await new Promise<any>((resolve) => {
    const open = indexedDB.open("autolister-telemetry", 1);
    open.onsuccess = () => {
      const request = open.result
        .transaction("queue")
        .objectStore("queue")
        .get("state");
      request.onsuccess = () => resolve(request.result);
    };
  });
  expect(
    state.events.map((entry: any) => entry.event.context.message).sort(),
  ).toEqual(["first", "second"]);
});
