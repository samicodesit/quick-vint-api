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
