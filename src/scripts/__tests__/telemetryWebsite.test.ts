import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { beforeAll, expect, it } from "vitest";
import { normalizeIncidentEvent } from "../../../utils/incidents/contract";
let IDBFactory: any;
beforeAll(async () => {
  IDBFactory = (await import("fake-indexeddb")).IDBFactory;
});

function browser(
  indexedDB: any,
  send: (body: any) => any,
  listeners: Record<string, (event: any) => void> = {},
) {
  const sandbox: any = {
    indexedDB,
    TextEncoder,
    URL,
    AbortController,
    crypto: { randomUUID },
    location: new URL("https://autolister.app/phone-upload"),
    navigator: { userAgent: "Chrome" },
    document: { visibilityState: "visible" },
    addEventListener(name: string, listener: (event: any) => void) {
      listeners[name] = listener;
    },
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

it.each(["error", "unhandledrejection"])(
  "retains safe throw-site and caller locations before %s stack redaction",
  async (capture) => {
    const listeners: Record<string, (event: any) => void> = {};
    const received: any[] = [];
    const telemetry = browser(
      new IDBFactory(),
      async (body) => {
        received.push(...body.events);
        return {
          status: 200,
          headers: new Headers(),
          json: async () => ({
            acknowledgedIds: body.events.map((e: any) => e.id),
          }),
        };
      },
      listeners,
    );
    const error = {
      name: "Error",
      message: "La",
      stack:
        "@https://external.invalid/private-script.js?token=private:20:4\nLi@https://autolister.app/phone-upload?s=private:726:18\n@https://autolister.app/phone-upload-recovery.js:12:3",
    };
    telemetry.setContextProvider(async () => ({ source: "phone_upload_page" }));
    listeners[capture](
      capture === "error"
        ? {
            filename:
              "https://external.invalid/private-script.js?token=private",
            lineno: 20,
            colno: 4,
            message: "Error: La",
            error,
          }
        : { reason: error },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await telemetry.flush();
    expect(received).toHaveLength(1);
    const expected = {
      version: 1,
      capture,
      ...(capture === "error"
        ? { location: { source: "external", line: 20, column: 4 } }
        : {}),
      frames: [
        { source: "external", line: 20, column: 4 },
        { source: "phone_page", line: 726, column: 18 },
        { source: "phone_recovery", line: 12, column: 3 },
      ],
    };
    expect(received[0].context.exceptionProvenance).toEqual(expected);
    expect(received[0].context.stack).toBe("@[url]\nLi@[url]\n@[url]");
    const retained = normalizeIncidentEvent(received[0], Date.now()).value!;
    expect(retained.context.exceptionProvenance).toEqual(expected);
    expect(retained.event).toBe("own_context_exception");
    expect(retained.definition.severity).toBe("blocking");
    expect(JSON.stringify(received[0])).not.toMatch(/private|external.invalid/);
  },
);

it("delivers final style choices and paywall origin through the shipped browser transport", async () => {
  const received: any[] = [];
  const telemetry = browser(new IDBFactory(), async (body) => {
    received.push(...body.events);
    return {
      status: 200,
      headers: new Headers(),
      json: async () => ({
        acknowledgedIds: body.events.map((entry: any) => entry.id),
      }),
    };
  });
  const choices = {
    phase: "complete",
    method: "apply",
    descriptionLength: "short",
    useBulletPoints: true,
    useHashtags: false,
    useEmojis: false,
    includeSellerNote: true,
    webSessionId: "session-1",
  };
  const pricing = {
    reason: "plans",
    entryPoint: "profile_menu",
    tier: "free",
    source: "home_hero",
    webSessionId: "session-1",
  };
  await telemetry.track("web_style_setup", {
    source: "mobile_web",
    page: "/app",
    context: { ...choices, descriptionFooterText: "private note" },
  });
  await telemetry.track("web_paywall_view", {
    source: "mobile_web",
    page: "/app",
    context: pricing,
  });
  await telemetry.flush();
  const platform = {
    browserFamily: "chrome",
    clientBrowser: "chrome",
    clientPlatform: "desktop",
  };
  expect(
    received.find((entry) => entry.event === "web_style_setup")?.context,
  ).toEqual({ ...choices, ...platform });
  expect(
    received.find((entry) => entry.event === "web_paywall_view")?.context,
  ).toEqual({ ...pricing, ...platform });
});

it.each([
  ["error", { filename: "", message: "Script error." }, false],
  ["error", { filename: null, message: "Script error." }, false],
  ["error", { filename: "   ", message: "Script error." }, false],
  [
    "error",
    { filename: "https://wallet.example/injected.js", lineno: 10 },
    false,
  ],
  [
    "error",
    {
      filename: "https://autolister.app/phone-upload",
      lineno: 0,
      error: { stack: "global code@https://autolister.app/phone-upload:0:0" },
    },
    false,
  ],
  [
    "error",
    { filename: "https://autolister.app/phone-upload", lineno: 450 },
    true,
  ],
  [
    "error",
    { filename: "https://autolister.app/telemetry-client.js", lineno: 10 },
    true,
  ],
  [
    "error",
    {
      filename: "",
      error: { stack: "run@https://autolister.app/telemetry-client.js:12:3" },
    },
    true,
  ],
  [
    "unhandledrejection",
    {
      reason: { stack: "global code@https://autolister.app/phone-upload:0:0" },
    },
    false,
  ],
  [
    "unhandledrejection",
    { reason: { stack: "run@https://wallet.example/injected.js:12:3" } },
    false,
  ],
  [
    "unhandledrejection",
    { reason: { stack: "run@https://autolister.app/phone-upload:450:3" } },
    true,
  ],
  [
    "unhandledrejection",
    {
      reason: {
        stack: "at run (https://autolister.app/telemetry-client.js:12:3)",
      },
    },
    true,
  ],
])(
  "attributes %s exceptions only with owned script evidence (%j)",
  async (name, event, owned) => {
    const listeners: Record<string, (event: any) => void> = {};
    const received: any[] = [];
    const telemetry = browser(
      new IDBFactory(),
      async (body) => {
        received.push(...body.events);
        return {
          status: 200,
          headers: new Headers(),
          json: async () => ({
            acknowledgedIds: body.events.map((entry: any) => entry.id),
          }),
        };
      },
      listeners,
    );
    listeners[String(name)](event);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await telemetry.flush();
    expect(received.map((entry) => entry.event)).toEqual(
      owned ? ["own_context_exception"] : [],
    );
  },
);

it("bounds shipped client provenance and identifies Chromium and opaque frames", async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const received: any[] = [];
  const telemetry = browser(
    new IDBFactory(),
    async (body) => {
      received.push(...body.events);
      return {
        status: 200,
        headers: new Headers(),
        json: async () => ({
          acknowledgedIds: body.events.map((e: any) => e.id),
        }),
      };
    },
    listeners,
  );
  telemetry.setContextProvider(async () => ({ source: "phone_upload_page" }));
  listeners.error({
    filename: "https://autolister.app/phone-upload?s=private",
    lineno: 1e8,
    colno: -1,
    message: "Error: La",
    error: {
      name: "Error",
      stack:
        "Error: La\n at fn (blob:https://autolister.app/private:5:2)\n at run (https://autolister.app/telemetry-website.js?token=private:12:3)\n at app (https://autolister.app/private.js:13:4)\n at fourth (https://autolister.app/phone-upload:88:9)",
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await telemetry.flush();
  expect(received[0].context.exceptionProvenance).toEqual({
    version: 1,
    capture: "error",
    location: { source: "phone_page" },
    frames: [
      { source: "opaque", line: 5, column: 2 },
      { source: "telemetry_website", line: 12, column: 3 },
      { source: "same_origin_other", line: 13, column: 4 },
    ],
  });
  expect(JSON.stringify(received[0])).not.toContain("private");
});

it("allowlists website provenance before transport and keeps it off other paths", async () => {
  const received: any[] = [];
  const telemetry = browser(new IDBFactory(), async (body) => {
    received.push(...body.events);
    return {
      status: 200,
      headers: new Headers(),
      json: async () => ({
        acknowledgedIds: body.events.map((e: any) => e.id),
      }),
    };
  });
  const exceptionProvenance = {
    version: 1,
    capture: "error",
    filename: "private",
    location: { source: "phone_page", line: -1, column: 1e8 },
    frames: [
      { source: "external", line: 1, column: 2, function: "private" },
      { source: "private" },
      { source: "opaque" },
      { source: "phone_page" },
    ],
  };
  await telemetry.track("own_context_exception", {
    source: "phone_upload_page",
    context: { exceptionProvenance },
  });
  await telemetry.track("own_context_exception", {
    source: "mobile_web",
    context: { exceptionProvenance },
  });
  expect(received[0].context.exceptionProvenance).toEqual({
    version: 1,
    capture: "error",
    location: { source: "phone_page" },
    frames: [{ source: "external", line: 1, column: 2 }, { source: "opaque" }],
  });
  expect(JSON.stringify(received[0])).not.toContain("private");
  expect(received[1].context).not.toHaveProperty("exceptionProvenance");
});

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
