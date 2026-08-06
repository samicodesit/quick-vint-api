import vm from "node:vm";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps a background-installed extension detected when focus checks overlap", async () => {
  const { outputFiles } = await build({
    entryPoints: ["src/scripts/pricing.js"],
    bundle: true,
    format: "iife",
    write: false,
  });
  const handlers: Record<string, () => Promise<void>> = {};
  const storage = new Map<string, string>();
  const opened: string[] = [];
  const status = { textContent: "", style: {} };
  const buttons = new Map(
    ["free", "starter", "pro", "business"].map((plan) => {
      const text = { textContent: plan === "free" ? "Start free" : "Choose" };
      const status = { textContent: "" };
      const listeners: Record<string, () => Promise<void>> = {};
      return [
        `btn-${plan}`,
        {
          dataset: { loggedOutLabel: text.textContent },
          disabled: false,
          classList: { add() {}, remove() {} },
          addEventListener(event: string, handler: () => Promise<void>) {
            listeners[event] = handler;
          },
          querySelector(selector: string) {
            return selector === ".btn-text" ? text : status;
          },
          listeners,
          text,
        },
      ];
    }),
  );
  const context: Record<string, any> = {
    Blob,
    console,
    navigator: {
      sendBeacon() {
        throw new Error("analytics blocked");
      },
    },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    document: {
      documentElement: { lang: "en" },
      addEventListener() {},
      getElementById(id: string) {
        if (id === "pricing-status-message") return status;
        return buttons.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
    },
    window: {
      location: new URL(
        "https://autolister.app/pricing?utm_source=google&utm_campaign=business",
      ),
      localStorage: {
        getItem(key: string) {
          return storage.get(key) || null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
        removeItem(key: string) {
          storage.delete(key);
        },
      },
      gtag() {
        throw new Error("analytics blocked");
      },
      open(url: string) {
        opened.push(url);
      },
      addEventListener(event: string, handler: () => Promise<void>) {
        handlers[event] = handler;
      },
    },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(outputFiles[0].text, context);
  await handlers.DOMContentLoaded();
  expect(buttons.get("btn-business")?.text.textContent).toBe(
    "Get AutoLister AI",
  );
  await buttons.get("btn-business")?.listeners.click();
  expect(opened).toHaveLength(1);
  expect(
    JSON.parse(storage.get("autolister_pending_install_plan") || "null"),
  ).toEqual({
    plan: "business",
    createdAt: expect.any(Number),
    utm: {
      utm_campaign: "business",
      utm_source: "google",
    },
  });

  context.window.gtag = undefined;
  await buttons.get("btn-business")?.listeners.click();
  await buttons.get("btn-business")?.listeners.click();
  expect(opened).toHaveLength(3);

  const messages: string[] = [];
  const pendingPings: Array<(response: unknown) => void> = [];
  context.chrome = context.window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(
        _extensionId: string,
        message: { type: string },
        callback: (response: unknown) => void,
      ) {
        messages.push(message.type);
        if (message.type !== "PING") {
          callback(null);
        } else if (pendingPings.length < 2) {
          pendingPings.push(callback);
        } else {
          callback(null);
        }
      },
    },
  };

  const firstFocus = handlers.focus();
  const secondFocus = handlers.focus();
  pendingPings[0]({ installed: true });
  await firstFocus;
  pendingPings[1](null);
  await secondFocus;
  await handlers.focus();

  expect(messages).toEqual([
    "PING",
    "PING",
    "GET_USER_PROFILE",
    "GET_USER_PROFILE",
  ]);
  expect(buttons.get("btn-business")?.text.textContent).toBe(
    "Sign in to continue",
  );
});
