import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routePaths = [
  "src/pages/app/index.astro",
  "src/pages/app/auth/callback.astro",
];

describe("private mobile web documents", () => {
  it("stay private and do not publish schema or a canonical URL", () => {
    for (const path of routePaths) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('name="robots" content="noindex, nofollow"');
      expect(source).not.toContain("application/ld+json");
      expect(source).not.toContain('rel="canonical"');
      expect(source).toContain("connect-src");
      expect(source).toContain("'self'");
      expect(source).toContain(
        "img-src 'self' https://flagcdn.com data: blob:",
      );
      expect(source).toContain("https://flagcdn.com");
      expect(source).toContain("PUBLIC_MOBILE_WEB_APP_ENABLED");
    }
  });

  it("keeps the mobile callback separate from the extension callback", () => {
    const indexSource = readFileSync("src/pages/app/index.astro", "utf8");
    const callbackSource = readFileSync(
      "src/pages/app/auth/callback.astro",
      "utf8",
    );

    expect(indexSource).not.toContain("/auth/callback.js");
    expect(callbackSource).not.toContain("public/auth-callback.js");
    expect(callbackSource).not.toContain("chrome-extension://");
    expect(callbackSource).toContain("completeWebCallback");
    expect(callbackSource).toContain('window.location.replace("/app")');
  });

  it("renders a disabled state without loading client modules when the rollout flag is off", () => {
    const source = readFileSync("src/pages/app/index.astro", "utf8");

    expect(source).toContain("Mobile web app unavailable");
    expect(source).toContain("buildConfig.enabled");
    expect(source).toContain("mountMobileWebApp");
    expect(source).not.toContain('<script type="module">');
  });
});
