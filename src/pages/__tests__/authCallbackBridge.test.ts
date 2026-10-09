import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

async function runBridge(
  href: string,
  extensionResponse: unknown,
  options: {
    lastError?: { message: string } | null;
    storage?: {
      getItem: (key: string) => string | null;
      removeItem?: (key: string) => void;
    };
    fetch?: (
      url: string,
      options: { body?: string; headers?: Record<string, string> },
    ) => Promise<{ ok: boolean; status?: number }>;
  } = {},
) {
  const events: unknown[] = [];
  const messages: unknown[] = [];
  const requests: {
    url: string;
    options: { body?: string; headers?: Record<string, string> };
  }[] = [];
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
    AutoListerWebsiteTelemetry: {
      track: async (event: string, properties: Record<string, unknown>) => {
        events.push({ event, ...properties });
        return { queued: true };
      },
    },
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
      localStorage: options.storage || { getItem: () => null },
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
          context.chrome.runtime.lastError = options.lastError || null;
          callback(extensionResponse);
          context.chrome.runtime.lastError = null;
        },
        lastError: null as { message: string } | null,
      },
    },
    fetch: async (
      _url: string,
      fetchOptions: { body?: string; headers?: Record<string, string> },
    ) => {
      requests.push({ url: _url, options: fetchOptions });
      if (options.fetch) return options.fetch(_url, fetchOptions);
      return { ok: true, status: 200 };
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

  return {
    events,
    messages,
    requests,
    replacedUrls,
    elements,
    timers,
    locationHref: String(context.window.location.href),
  };
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

  it.each(["tiktok", "x", "newsletter", "unknown"])(
    "claims %s first touch without changing extension handoff data",
    async (source) => {
      const referrerHost =
        source === "x"
          ? "t.co"
          : source === "tiktok"
            ? "www.tiktok.com"
            : "seller-forum.example";
      const removedKeys: string[] = [];
      const { messages, requests } = await runBridge(
        "https://autolister.app/auth/callback#access_token=access-1&refresh_token=refresh-1",
        { ok: true },
        {
          storage: {
            getItem: (key) =>
              key === "autolister.first_touch.v1"
                ? JSON.stringify({
                    source,
                    medium: "organic_social",
                    campaign: "profile-link",
                    content: "comment-1",
                    capturedAt: "2026-09-22T10:00:00.000Z",
                    referrerHost,
                    ignored: "secret",
                  })
                : null,
            removeItem: (key) => removedKeys.push(key),
          },
        },
      );

      expect(messages).toEqual([
        {
          extensionId: "mommklhpammnlojjobejddmidmdcalcl",
          message: {
            type: "AUTH_HANDOFF",
            closeDelayMs: 3400,
            session: {
              access_token: "access-1",
              expires_in: undefined,
              refresh_token: "refresh-1",
              token_type: "bearer",
            },
          },
        },
      ]);
      const claim = requests.find(({ url }) =>
        url.endsWith("/api/attribution/claim"),
      );
      expect(claim).toBeDefined();
      expect(claim?.options.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer access-1",
      });
      expect(JSON.parse(String(claim?.options.body))).toEqual({
        attribution: {
          source,
          medium: "organic_social",
          campaign: "profile-link",
          content: "comment-1",
          capturedAt: "2026-09-22T10:00:00.000Z",
          referrerHost,
        },
      });
      expect(removedKeys).toEqual(["autolister.first_touch.v1"]);
      expect(JSON.stringify(messages[0])).not.toContain("secret");
    },
  );

  it("keeps the auth handoff successful when the website claim fails", async () => {
    const { messages } = await runBridge(
      "https://autolister.app/auth/callback#access_token=access-1&refresh_token=refresh-1",
      { ok: true },
      {
        storage: {
          getItem: () =>
            JSON.stringify({
              source: "tiktok",
              medium: "organic_social",
              capturedAt: "2026-09-22T10:00:00.000Z",
            }),
        },
        fetch: async (url) => {
          if (url.endsWith("/api/attribution/claim")) {
            throw new Error("offline");
          }
          return { ok: true, status: 200 };
        },
      },
    );

    expect(messages[0]).toEqual({
      extensionId: "mommklhpammnlojjobejddmidmdcalcl",
      message: expect.objectContaining({ type: "AUTH_HANDOFF" }),
    });
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

  it("falls back to the extension callback page when old extension handoff closes the port", async () => {
    const { events, locationHref } = await runBridge(
      "https://autolister.app/auth/callback#access_token=access-1&refresh_token=refresh-1&expires_in=3600&token_type=bearer",
      undefined,
      {
        lastError: {
          message: "The message port closed before a response was received.",
        },
      },
    );

    expect(events).toEqual([
      expect.objectContaining({ event: "auth_link_landed" }),
      expect.objectContaining({ event: "auth_extension_handoff_started" }),
      expect.objectContaining({
        event: "auth_extension_handoff_error",
        context: expect.objectContaining({
          message: "The message port closed before a response was received.",
        }),
      }),
      expect.objectContaining({ event: "auth_extension_callback_fallback" }),
    ]);
    expect(locationHref).toBe(
      "chrome-extension://mommklhpammnlojjobejddmidmdcalcl/callback.html#access_token=access-1&refresh_token=refresh-1&expires_in=3600&token_type=bearer",
    );
  });
});
