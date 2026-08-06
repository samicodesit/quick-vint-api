import vm from "node:vm";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps a background-installed extension detected when focus checks overlap", async () => {
  const { outputFiles } = await build({
    entryPoints: ["src/scripts/pricing.js"],
    bundle: true,
    format: "iife",
    write: false,
    plugins: [
      {
        name: "stub-analytics",
        setup(build) {
          build.onResolve({ filter: /analytics\.js$/ }, () => ({
            path: "analytics",
            namespace: "test",
          }));
          build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: "export function trackEvent() {}",
          }));
        },
      },
    ],
  });
  const handlers: Record<string, () => Promise<void>> = {};
  const buttons = new Map(
    ["free", "starter", "pro", "business"].map((plan) => {
      const text = { textContent: plan === "free" ? "Start free" : "Choose" };
      const status = { textContent: "" };
      return [
        `btn-${plan}`,
        {
          dataset: { loggedOutLabel: text.textContent },
          disabled: false,
          classList: { add() {}, remove() {} },
          addEventListener() {},
          querySelector(selector: string) {
            return selector === ".btn-text" ? text : status;
          },
          text,
        },
      ];
    }),
  );
  const context: Record<string, any> = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    document: {
      documentElement: { lang: "en" },
      getElementById(id: string) {
        return buttons.get(id) || null;
      },
    },
    window: {
      location: new URL("https://autolister.app/pricing"),
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
