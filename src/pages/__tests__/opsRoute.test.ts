import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OS route boundary", () => {
  it("app_deep_link_preserves_public_and_api_routes", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.rewrites).toContainEqual({
      source: "/app/:path*",
      destination: "/app",
    });
    expect(config.rewrites).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "/:path*" })]),
    );
    const host = readFileSync("src/ops/app/AppHost.astro", "utf8");
    expect(host).toContain("App");
    expect(host).toContain("client:load");
  });

  it("ops_flag_off_preserves_existing_product", () => {
    const host = readFileSync("src/ops/app/AppHost.astro", "utf8");
    expect(host).toContain("PUBLIC_OPS_ENABLED");
    expect(host).toContain("OS is not enabled");
    expect(readFileSync("src/pages/index.astro", "utf8")).toContain(
      "SiteLayout",
    );
  });
});
