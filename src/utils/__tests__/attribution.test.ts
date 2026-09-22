import { describe, expect, it } from "vitest";
import {
  parseAttributionInput,
  sanitizeAttribution,
} from "../../../utils/attribution";

const capturedAt = "2026-09-22T10:00:00.000Z";

describe("attribution input sanitization", () => {
  it("accepts a bounded TikTok attribution record", () => {
    expect(
      sanitizeAttribution({
        source: "tiktok",
        medium: "organic_social",
        campaign: "Profile Link",
        content: "Comment 1",
        capturedAt,
        referrerHost: "www.tiktok.com",
      }),
    ).toEqual({
      source: "tiktok",
      medium: "organic_social",
      campaign: "profile-link",
      content: "comment-1",
      capturedAt,
      referrerHost: "www.tiktok.com",
    });
  });

  it("rejects unknown source and medium values instead of storing them", () => {
    expect(
      sanitizeAttribution({
        source: "https://evil.example/collect?email=secret",
        medium: "javascript",
        capturedAt,
      }),
    ).toBeNull();
  });

  it("drops untrusted referrers and caps campaign data", () => {
    const result = sanitizeAttribution({
      source: "tiktok",
      medium: "organic_social",
      campaign: "x".repeat(500),
      content: "short",
      capturedAt,
      referrerHost: "evil.example",
    });

    expect(result).toMatchObject({
      source: "tiktok",
      medium: "organic_social",
      campaign: "x".repeat(80),
      content: "short",
      referrerHost: null,
    });
  });

  it("rejects malformed or missing timestamps", () => {
    expect(
      parseAttributionInput({
        source: "tiktok",
        medium: "organic_social",
        capturedAt: "yesterday",
      }),
    ).toBeNull();
    expect(
      parseAttributionInput({
        source: "tiktok",
        medium: "organic_social",
      }),
    ).toBeNull();
  });
});
