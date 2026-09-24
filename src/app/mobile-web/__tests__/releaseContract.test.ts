import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appRoute = readFileSync("src/pages/app/index.astro", "utf8");
const stylesheet = readFileSync("src/styles/mobile-web-app.css", "utf8");
const workspaceShell = readFileSync(
  "src/components/mobile-web/WorkspaceShell.astro",
  "utf8",
);
const photoRail = readFileSync(
  "src/components/mobile-web/PhotoRail.astro",
  "utf8",
);
const listingControls = readFileSync(
  "src/components/mobile-web/ListingControls.astro",
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
    const stylesheetWithoutComments = stylesheet.replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(stylesheetWithoutComments).toContain("color-scheme: light");
    expect(stylesheetWithoutComments).not.toMatch(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/,
    );
    expect(photoRail).toContain("overflow-x: auto");
    expect(photoRail).toContain("overflow-y: hidden");
    expect(stylesheet).toContain(".mobile-primary-button");
    expect(stylesheet).not.toContain("height: 100vh");
  });

  it("wires the usage card selectors used by the authenticated renderer", () => {
    for (const selector of [
      'data-mobile-web="usage"',
      'data-mobile-web="usage-headline"',
      'data-mobile-web="usage-free"',
      'data-mobile-web="usage-free-value"',
      'data-mobile-web="usage-paid"',
      'data-mobile-web="usage-daily-value"',
      'data-mobile-web="usage-daily-track"',
      'data-mobile-web="usage-daily-progress"',
      'data-mobile-web="usage-monthly-value"',
      'data-mobile-web="usage-monthly-track"',
      'data-mobile-web="usage-monthly-progress"',
      'data-mobile-web="usage-credits"',
      'data-mobile-web="usage-credits-value"',
    ]) {
      expect(workspaceShell).toContain(selector);
    }
  });

  it("keeps the authenticated shell selectors needed by the mobile workspace behavior", () => {
    for (const selector of [
      'data-mobile-web="profile-menu-trigger"',
      'data-mobile-web="profile-menu"',
      'data-mobile-web="camera-input"',
      'data-mobile-web="gallery-input"',
      'data-mobile-web="generate"',
      'data-mobile-web="generation-status"',
    ]) {
      expect(workspaceShell).toContain(selector);
    }
    expect(photoRail).toContain('data-mobile-web="photo-empty-state"');
    expect(photoRail).toContain('data-mobile-web="photo-list"');
    expect(listingControls).toContain('data-mobile-language-trigger="title"');
    expect(listingControls).toContain(
      'data-mobile-language-trigger="description"',
    );
    expect(listingControls).toContain("data-mobile-format-sheet-trigger");
  });

  it("uses the compact brand treatment for the quota strip and photo actions", () => {
    expect(stylesheet).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr))",
    );
    expect(photoRail).toContain("border: 1.5px dashed");
    expect(stylesheet).toContain("background: var(--mobile-brand)");
    expect(stylesheet).toContain("position: sticky");
  });

  it("leaves enough mobile scroll clearance for the sticky generation panel", () => {
    expect(stylesheet).toContain(
      "padding-bottom: calc(128px + env(safe-area-inset-bottom))",
    );
  });
});
