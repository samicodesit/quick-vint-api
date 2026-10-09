import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { captureFirstTouch } from "../../scripts/attribution.js";

function runShareLink(href: string) {
  let replacedUrl = href;
  vm.runInNewContext(
    readFileSync(join(process.cwd(), "public/x-share-link.js"), "utf8"),
    {
      URL,
      window: {
        location: { href },
        history: {
          state: { existing: true },
          replaceState: (_state: unknown, _title: string, url: string) => {
            replacedUrl = url;
          },
        },
      },
    },
  );
  return replacedUrl;
}

describe("X short share link", () => {
  it("tags the short landing URL before signup attribution is captured", () => {
    const href = runShareLink("https://autolister.app/x");
    expect(href).toBe(
      "https://autolister.app/x?utm_source=x&utm_medium=organic_social&utm_campaign=posts",
    );
    const values = new Map<string, string>();
    expect(
      captureFirstTouch({
        href,
        storage: {
          getItem: (key: string) => values.get(key) || null,
          setItem: (key: string, value: string) => values.set(key, value),
        },
        now: "2026-10-01T10:00:00.000Z",
      }),
    ).toMatchObject({
      source: "x",
      medium: "organic_social",
      campaign: "posts",
    });
  });

  it("preserves explicit campaign data and the destination fragment", () => {
    const href = runShareLink(
      "https://autolister.app/x?utm_campaign=launch&utm_content=post-2#features",
    );
    const url = new URL(href);
    expect(url.searchParams.get("utm_campaign")).toBe("launch");
    expect(url.searchParams.get("utm_content")).toBe("post-2");
    expect(url.searchParams.get("utm_source")).toBe("x");
    expect(url.hash).toBe("#features");
  });
});
