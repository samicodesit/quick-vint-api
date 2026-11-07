import { describe, expect, it } from "vitest";
import { bootstrapHomepageEntryRoute } from "../homepageEntryRoute";

function browser(ua: string, wide = true) {
  let resize = () => {};
  const media = {
    matches: wide,
    addEventListener: (_: string, f: () => void) => {
      resize = f;
    },
  };
  const w = {
    navigator: { userAgent: ua },
    document: { documentElement: { dataset: {} as Record<string, string> } },
    matchMedia: () => media,
  };
  bootstrapHomepageEntryRoute(w as unknown as Window & typeof globalThis);
  return {
    route: () => w.document.documentElement.dataset.homeEntryRoute,
    resize: (value: boolean) => {
      media.matches = value;
      resize();
    },
  };
}
describe("homepage entry compatibility", () => {
  it("offers integration on desktop Chrome and switches when the viewport narrows", () => {
    const b = browser("Mozilla/5.0 Windows NT 10.0 Chrome/142.0 Safari/537.36");
    expect(b.route()).toBe("extension");
    b.resize(false);
    expect(b.route()).toBe("web");
    b.resize(true);
    expect(b.route()).toBe("extension");
  });
  it.each([
    "Mozilla/5.0 iPhone CriOS/142.0 Mobile Safari/604.1",
    "Mozilla/5.0 Android Chrome/142.0 Mobile Safari/537.36",
    "Mozilla/5.0 Firefox/144.0",
    "Mozilla/5.0 Macintosh Version/18.0 Safari/605.1",
    "Mozilla/5.0 Windows Chrome/142.0 Edg/142.0",
    "Mozilla/5.0 Windows Chrome/142.0 OPR/123.0",
  ])("keeps the no-install route for %s", (ua) =>
    expect(browser(ua).route()).toBe("web"),
  );
  it("does not fail the page when browser APIs are unavailable", () =>
    expect(() =>
      bootstrapHomepageEntryRoute({} as Window & typeof globalThis),
    ).not.toThrow());
});
