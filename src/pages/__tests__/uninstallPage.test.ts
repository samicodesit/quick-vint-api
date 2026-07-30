import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readUninstallPage() {
  return readFileSync(join(process.cwd(), "src/pages/uninstall.astro"), "utf8");
}

function readUiComponentsPage() {
  return readFileSync(
    join(process.cwd(), "src/pages/ui-components.astro"),
    "utf8",
  );
}

describe("uninstall page winback character", () => {
  it("renders an optimized character asset around the coupon offer", () => {
    const html = readUninstallPage();

    expect(html).toContain('class="offer-visual"');
    expect(html).toContain('src="/uninstall-winback-character.webp"');
    expect(html).toContain('class="coupon-wrap"');
    expect(html).toContain("uninstallCharacterIn");
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps the uninstall page available from the local UI preview hub", () => {
    const html = readUiComponentsPage();

    expect(html).toContain("Uninstall Winback Page");
    expect(html).toContain("/uninstall?preview=1");
  });
});
