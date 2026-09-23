import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appRoute = readFileSync("src/pages/app/index.astro", "utf8");
const stylesheet = readFileSync("src/styles/mobile-web-app.css", "utf8");
const photoRail = readFileSync(
  "src/components/mobile-web/PhotoRail.astro",
  "utf8",
);

describe("mobile web launch contract", () => {
  it("mounts the shared workspace only for the exact enabled build flag", () => {
    expect(appRoute).toContain(
      'import WorkspaceShell from "../../components/mobile-web/WorkspaceShell.astro"',
    );
    expect(appRoute).toContain('import "../../styles/mobile-web-app.css"');
    expect(appRoute).toContain("buildConfig.enabled");
    expect(appRoute).toContain("mountMobileWebApp");
    expect(appRoute).toContain("<script>");
    expect(appRoute).not.toContain('<script type="module">');
    expect(appRoute).toContain('data-mobile-web="disabled"');
    expect(appRoute).not.toContain("indexedDB");
    expect(appRoute).not.toContain("serviceWorker");
  });

  it("bundles the enabled client instead of leaving a source-relative import", () => {
    const builtPath = "dist/app/index.html";
    if (!existsSync(builtPath)) return;

    const builtApp = readFileSync(builtPath, "utf8");
    if (builtApp.includes("Mobile web app unavailable")) return;

    expect(builtApp).not.toContain("../../app/mobile-web/app");
    expect(builtApp).toMatch(/<script type="module" src="\/_astro\//);
  });

  it("keeps private app documents out of indexing and public schema", () => {
    expect(appRoute).toContain('name="robots" content="noindex, nofollow"');
    expect(appRoute).not.toContain("application/ld+json");
    expect(appRoute).not.toContain('rel="canonical"');
    expect(appRoute).toContain("PUBLIC_MOBILE_WEB_APP_ENABLED");
  });

  it("provides compact, touch-safe, and safe-area-aware app styling", () => {
    expect(stylesheet).toContain("env(safe-area-inset-bottom)");
    expect(stylesheet).toContain("min-height: 44px");
    expect(stylesheet).toContain("position: sticky");
    expect(stylesheet).toContain("prefers-reduced-motion");
    expect(stylesheet).toContain("prefers-color-scheme: dark");
    expect(photoRail).toContain("overflow-x: auto");
    expect(photoRail).toContain("overflow-y: hidden");
    expect(stylesheet).toContain(".mobile-primary-button");
    expect(stylesheet).not.toContain("height: 100vh");
  });
});
