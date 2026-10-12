import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/HomeLanding.astro"),
  "utf8",
);
const layout = readFileSync(
  join(process.cwd(), "src/layouts/SiteLayout.astro"),
  "utf8",
);
const publicStatsTag =
  layout.match(/<div\s+data-public-stats[\s\S]*?>/)?.[0] || "";

describe("HomeLanding performance", () => {
  it("defers the public stats counter until after initial page load", () => {
    expect(source).not.toMatch(
      /if \(publicStatsRoot\)\s*{\s*loadPublicStats\(\);\s*}/,
    );
    expect(source).toContain("schedulePublicStatsLoad();");
    expect(source).toContain('window.addEventListener("load"');
    expect(source).toContain("requestIdleCallback");
  });

  it("keeps a fixed public-stats slot while the deferred count loads", () => {
    expect(publicStatsTag).not.toMatch(/\bhidden\b/);
    expect(publicStatsTag).toMatch(/\bflex\b/);
    expect(layout).toContain('aria-busy="true"');
    expect(layout).toContain('class="public-stat-number">...</span>');
    expect(layout).toContain("height: 38px");
    expect(publicStatsTag).not.toMatch(/rounded|border|shadow|bg-white/);
    expect(source).not.toContain("animatePublicStatNumber");
    expect(source).not.toContain(
      '.public-stats-video-badge[data-loaded="true"]',
    );
  });

  it("does not eagerly request the heavy hero video before first paint", () => {
    expect(source).not.toMatch(/\s+src="\/vid-promo\.mp4"/);
    expect(source).toContain('data-video-src="/vid-promo.mp4"');
    expect(source).toContain("scheduleHeroVideoLoad();");
  });

  it("keeps the homepage tier proof rail in normal document flow", () => {
    expect(source).not.toMatch(
      /\.home-tier-proof-rail\s*{[\s\S]*?position:\s*fixed/,
    );
    expect(source).not.toContain("data-docked");
    expect(source).not.toContain("IntersectionObserver");
  });
});
