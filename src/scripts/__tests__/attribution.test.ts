import { describe, expect, it } from "vitest";
import { captureFirstTouch, readStoredAttribution } from "../attribution.js";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("website first-touch attribution", () => {
  it.each([
    ["gemini.google.com", "gemini.google.com"],
    ["claude.ai", "claude.ai"],
    ["claude.com", "claude.ai"],
    ["www.claude.ai", "claude.ai"],
    ["perplexity.ai", "perplexity.ai"],
    ["www.perplexity.ai", "perplexity.ai"],
    ["grok.com", "grok.com"],
    ["www.grok.com", "grok.com"],
  ])("recognizes an AI assistant referral from %s", (host, source) => {
    expect(
      captureFirstTouch({
        href: "https://autolister.app/ai-model-photos",
        referrer: `https://${host}/private-conversation`,
        storage: createStorage(),
      }),
    ).toMatchObject({ source, medium: "referral", referrerHost: host });
  });

  it.each(["gemini.google.com", "claude.ai", "perplexity.ai", "grok.com"])(
    "recognizes an explicitly tagged AI assistant source: %s",
    (source) => {
      expect(
        captureFirstTouch({
          href: `https://autolister.app/?utm_source=${source}`,
          storage: createStorage(),
        }),
      ).toMatchObject({ source, medium: "referral" });
    },
  );

  it("does not guess Grok attribution from an X short link", () => {
    expect(
      captureFirstTouch({
        href: "https://autolister.app/",
        referrer: "https://t.co/example",
        storage: createStorage(),
      }),
    ).toMatchObject({ source: "x", medium: "organic_social" });
  });

  it.each(["chatgpt.com", "www.chatgpt.com", "chat.openai.com"])(
    "recognizes an untagged ChatGPT referral from %s",
    (host) => {
      expect(
        captureFirstTouch({
          href: "https://autolister.app/ai-model-photos",
          referrer: `https://${host}/c/private-conversation-id`,
          storage: createStorage(),
        }),
      ).toMatchObject({
        source: "chatgpt.com",
        medium: "referral",
        referrerHost: host,
      });
    },
  );

  it("keeps tagged ChatGPT attribution through an internal guide CTA", () => {
    const storage = createStorage();
    const first = captureFirstTouch({
      href: "https://autolister.app/ai-model-photos?utm_source=chatgpt.com",
      storage,
    });
    expect(first).toMatchObject({ source: "chatgpt.com", medium: "referral" });
    expect(
      captureFirstTouch({
        href: "https://autolister.app/app?ref=model_photos_web",
        referrer: "https://autolister.app/ai-model-photos",
        storage,
      }),
    ).toEqual(first);
  });

  it("does not classify a lookalike host as ChatGPT", () => {
    expect(
      captureFirstTouch({
        href: "https://autolister.app/",
        referrer: "https://chatgpt.com.example.org/c/private",
        storage: createStorage(),
      }),
    ).toMatchObject({
      source: "unknown",
      medium: "referral",
      referrerHost: "chatgpt.com.example.org",
    });
  });

  it("keeps an explicit accepted medium for a tagged ChatGPT source", () => {
    expect(
      captureFirstTouch({
        href: "https://autolister.app/?utm_source=chatgpt.com&utm_medium=search",
        storage: createStorage(),
      }),
    ).toMatchObject({ source: "chatgpt.com", medium: "search" });
  });

  it.each(["2026-01-01T10:00:00.000Z", "2026-10-07T11:00:00.000Z"])(
    "replaces an expired or future first touch: %s",
    (capturedAt) => {
      const storage = createStorage();
      captureFirstTouch({
        href: "https://autolister.app/?utm_source=x",
        storage,
        now: capturedAt,
      });
      const fresh = captureFirstTouch({
        href: "https://autolister.app/?utm_source=google&utm_medium=search",
        storage,
        now: "2026-10-07T10:00:00.000Z",
      });
      expect(fresh).toMatchObject({
        source: "google",
        capturedAt: "2026-10-07T10:00:00.000Z",
      });
      expect(readStoredAttribution(storage)).toEqual(fresh);
    },
  );

  it("keeps the X share link as first touch for later signup", () => {
    const storage = createStorage();
    const first = captureFirstTouch({
      href: "https://autolister.app/?utm_source=x&utm_medium=organic_social&utm_campaign=posts",
      referrer: "https://t.co/share",
      storage,
      now: "2026-10-01T10:00:00.000Z",
    });

    expect(first).toEqual({
      source: "x",
      medium: "organic_social",
      campaign: "posts",
      content: null,
      capturedAt: "2026-10-01T10:00:00.000Z",
      referrerHost: "t.co",
    });
    expect(
      captureFirstTouch({
        href: "https://autolister.app/pricing",
        storage,
      }),
    ).toEqual(first);
    expect(readStoredAttribution(storage)).toEqual(first);
  });

  it.each(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "t.co"])(
    "recognizes %s referrals as X when UTMs are absent",
    (host) => {
      expect(
        captureFirstTouch({
          href: "https://autolister.app/",
          referrer: `https://${host}/seller/status/123`,
          storage: createStorage(),
          now: "2026-10-01T10:00:00.000Z",
        }),
      ).toMatchObject({
        source: "x",
        medium: "organic_social",
        referrerHost: host,
      });
    },
  );

  it("does not trust a referrer containing an X host in another domain", () => {
    expect(
      captureFirstTouch({
        href: "https://autolister.app/",
        referrer: "https://x.com.evil.example/status/123",
        storage: createStorage(),
      }),
    ).toMatchObject({
      source: "unknown",
      medium: "referral",
      referrerHost: "x.com.evil.example",
    });
  });

  it("keeps an unfamiliar tagged source for signup", () => {
    const storage = createStorage();
    expect(
      captureFirstTouch({
        href: "https://autolister.app/?utm_source=newsletter&utm_medium=email",
        storage,
      }),
    ).toMatchObject({ source: "newsletter", medium: "email" });
    expect(readStoredAttribution(storage)).toMatchObject({
      source: "newsletter",
      medium: "email",
    });
  });

  it("keeps only the hostname of unfamiliar external referrals", () => {
    const storage = createStorage();
    expect(
      captureFirstTouch({
        href: "https://autolister.app/",
        referrer: "https://seller-forum.example/private/path?email=secret",
        storage,
      }),
    ).toMatchObject({
      source: "unknown",
      medium: "referral",
      referrerHost: "seller-forum.example",
    });
    expect(JSON.stringify(readStoredAttribution(storage))).not.toContain(
      "secret",
    );
  });

  it.each([
    "https://autolister.app/pricing",
    "https://localhost:3000/",
    "http://192.168.1.2/private",
    "javascript:alert(1)",
  ])(
    "does not call internal or invalid referrals acquisition: %s",
    (referrer) => {
      expect(
        captureFirstTouch({
          href: "https://autolister.app/",
          referrer,
          storage: createStorage(),
        }),
      ).toBeNull();
    },
  );

  it("captures allowlisted UTM values and keeps only safe fields", () => {
    const storage = createStorage();
    const result = captureFirstTouch({
      href: "https://autolister.app/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=Profile%20Link&utm_content=comment-1&email=secret",
      referrer: "https://www.tiktok.com/@seller/video/123",
      storage,
      now: "2026-09-22T10:00:00.000Z",
    });

    expect(result).toEqual({
      source: "tiktok",
      medium: "organic_social",
      campaign: "profile-link",
      content: "comment-1",
      capturedAt: "2026-09-22T10:00:00.000Z",
      referrerHost: "www.tiktok.com",
    });
    expect(JSON.stringify(storage)).not.toContain("secret");
  });

  it("does not overwrite an existing first touch", () => {
    const storage = createStorage();
    const first = captureFirstTouch({
      href: "https://autolister.app/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=first",
      storage,
      now: "2026-09-22T10:00:00.000Z",
    });
    const second = captureFirstTouch({
      href: "https://autolister.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=second",
      storage,
      now: "2026-09-22T11:00:00.000Z",
    });

    expect(second).toEqual(first);
    expect(readStoredAttribution(storage)).toEqual(first);
  });

  it("uses an allowlisted TikTok referrer when UTMs are absent", () => {
    const result = captureFirstTouch({
      href: "https://autolister.app/",
      referrer: "https://vm.tiktok.com/ZM123/",
      storage: createStorage(),
      now: "2026-09-22T10:00:00.000Z",
    });

    expect(result).toMatchObject({
      source: "tiktok",
      medium: "organic_social",
      referrerHost: "vm.tiktok.com",
    });
  });

  it("survives malformed storage and storage failures", () => {
    const malformed = createStorage({
      "autolister.first_touch.v1": "not-json",
    });
    expect(readStoredAttribution(malformed)).toBeNull();

    const throwingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(
      captureFirstTouch({
        href: "https://autolister.app/?utm_source=tiktok&utm_medium=organic_social",
        storage: throwingStorage,
        now: "2026-09-22T10:00:00.000Z",
      }),
    ).toBeNull();
  });
});
