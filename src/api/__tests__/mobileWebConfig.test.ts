import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMobileWebEnabled } from "../../../utils/mobileWeb";

describe("mobile web server rollout configuration", () => {
  it("covers both app documents and requires the exact mobile flag", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));

    for (const source of ["/app", "/app/(.*)", "/app/auth/callback/(.*)"]) {
      const entry = vercel.headers?.find(
        (candidate: { source?: string }) => candidate.source === source,
      );
      expect(entry?.headers).toContainEqual({
        key: "X-Robots-Tag",
        value: "noindex, nofollow",
      });
    }

    expect(
      isMobileWebEnabled({
        MOBILE_WEB_APP_ENABLED: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isMobileWebEnabled({ MOBILE_WEB_APP_ENABLED: "1" } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isMobileWebEnabled({
        MOBILE_WEB_APP_ENABLED: "TRUE",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
