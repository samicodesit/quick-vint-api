import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

async function runBridge(href: string, extensionResponse: unknown) {
  const events: unknown[] = [];
  const messages: unknown[] = [];
  const replacedUrls: string[] = [];
  const context = {
    console,
    URLSearchParams,
    setTimeout(callback: () => void) {
      callback();
      return 1;
    },
    clearTimeout() {},
    document: {
      getElementById() {
        return { textContent: "", classList: { add() {}, remove() {} } };
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

  return { events, messages, replacedUrls };
}

describe("auth callback bridge", () => {
  it("logs landing and hands magic-link tokens to the installed extension", async () => {
    const { events, messages, replacedUrls } = await runBridge(
      "https://autolister.app/auth/callback#access_token=access-1&refresh_token=refresh-1&expires_in=3600&token_type=bearer",
      { ok: true },
    );

    expect(replacedUrls).toEqual(["https://autolister.app/auth/callback"]);
    expect(messages).toEqual([
      {
        extensionId: "mommklhpammnlojjobejddmidmdcalcl",
        message: {
          type: "AUTH_HANDOFF",
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
