import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

async function runBridge(href: string, extensionResponse: unknown) {
  const events: unknown[] = [];
  const messages: unknown[] = [];
  const replacedUrls: string[] = [];
  const timers: { delay: number; callback: () => void }[] = [];
  const elements = new Map<
    string,
    {
      textContent: string;
      dataset: Record<string, string>;
      classList: {
        add: (...names: string[]) => void;
        remove: (...names: string[]) => void;
      };
      classes: Set<string>;
    }
  >();
  function getElement(id: string) {
    if (!elements.has(id)) {
      const classes = new Set<string>();
      elements.set(id, {
        textContent: "",
        dataset: {},
        classes,
        classList: {
          add: (...names: string[]) =>
            names.forEach((name) => classes.add(name)),
          remove: (...names: string[]) =>
            names.forEach((name) => classes.delete(name)),
        },
      });
    }
    return elements.get(id);
  }
  const context = {
    console,
    URLSearchParams,
    setTimeout(callback: () => void, delay = 0) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
    document: {
      title: "Signing in - AutoLister AI",
      getElementById(id: string) {
        return getElement(id);
      },
    },
    window: {
      location: new URL(href),
      addEventListener() {},
      history: {
        replaceState(_state: unknown, _title: string, url: string) {
          replacedUrls.push(url);
        },
      },
    },
    chrome: {
      runtime: {
        sendMessage(
          extensionId: string,
          message: unknown,
          callback: (response: unknown) => void,
        ) {
          messages.push({ extensionId, message });
          callback(extensionResponse);
        },
        lastError: null,
      },
    },
    fetch: async (_url: string, options: { body?: string }) => {
      events.push(JSON.parse(String(options.body || "{}")));
      return { ok: true };
    },
  };
  (context.window as any).window = context.window;
  (context.window as any).document = context.document;
  (context.window as any).chrome = context.chrome;

  vm.createContext(context);
  vm.runInContext(
    readFileSync(join(process.cwd(), "public/auth-callback.js"), "utf8"),
    context,
  );
  await new Promise((resolve) => setImmediate(resolve));

  return { events, messages, replacedUrls, elements, timers };
}

describe("auth callback bridge", () => {
  it("logs landing and hands magic-link tokens to the installed extension", async () => {
    const { events, messages, replacedUrls, elements, timers } =
      await runBridge(
        "https://autolister.app/auth/callback#access_token=access-1&refresh_token=refresh-1&expires_in=3600&token_type=bearer",
        { ok: true },
      );

    expect(replacedUrls).toEqual(["https://autolister.app/auth/callback"]);
    expect(messages).toEqual([
      {
        extensionId: "mommklhpammnlojjobejddmidmdcalcl",
        message: {
          type: "AUTH_HANDOFF",
          closeDelayMs: 3400,
          session: {
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_in: 3600,
            token_type: "bearer",
          },
        },
      },
    ]);
    expect(events).toEqual([
      expect.objectContaining({ event: "auth_link_landed" }),
      expect.objectContaining({ event: "auth_extension_handoff_started" }),
      expect.objectContaining({ event: "auth_extension_handoff_success" }),
    ]);
    expect(elements.get("authCountdown")?.textContent).toBe("3");
    expect(timers[0].delay).toBe(1000);
  });

  it("logs a hard handoff error when the extension rejects the session", async () => {
    const { events } = await runBridge(
      "https://autolister.app/auth/callback#access_token=access-1&refresh_token=refresh-1",
      { ok: false, error: "invalid_session" },
    );

    expect(events).toEqual([
      expect.objectContaining({ event: "auth_link_landed" }),
      expect.objectContaining({ event: "auth_extension_handoff_started" }),
      expect.objectContaining({
        event: "auth_extension_handoff_error",
        context: expect.objectContaining({ message: "invalid_session" }),
      }),
    ]);
  });
});
