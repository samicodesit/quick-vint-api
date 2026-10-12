import { describe, expect, it } from "vitest";
import {
  bootstrapHomepageExperiment,
  HOMEPAGE_EXPERIMENT,
  readHomepageAssignment,
} from "../homepageExperiment";

const now = Date.parse("2026-10-13T12:00:00Z");
function fixture(bit = 1, path = "/", width = 390) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const win = {
    Uint32Array,
    document: { documentElement: { dataset: {} as Record<string, string> } },
    location: { pathname: path },
    matchMedia: () => ({ matches: width < 768 }),
    localStorage: storage,
    Date: { now: () => now },
    crypto: { getRandomValues: (array: Uint32Array) => array.fill(bit) },
  };
  return { win, storage, values };
}
describe("mobile homepage assignment", () => {
  it.each([0, 1])(
    "allocates cryptographic bit %s and keeps its variant before paint",
    (bit) => {
      const { win, storage } = fixture(bit);
      bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT);
      expect(win.document.documentElement.dataset.homeEntryVariant).toBe(
        bit ? "b" : "a",
      );
      win.crypto.getRandomValues = (array) => array.fill(bit ? 0 : 1);
      bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT);
      expect(readHomepageAssignment(storage, now)?.variant).toBe(
        bit ? "b" : "a",
      );
    },
  );
  it.each(["/", "/fr/", "/de/", "/nl/", "/pl/", "/es/", "/it/", "/pt/"])(
    "covers localized homepage %s",
    (path) => {
      const { win } = fixture(1, path);
      bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT);
      expect(win.document.documentElement.dataset.homeEntryVariant).toBe("b");
    },
  );
  it("does not allocate on desktop or unrelated pages", () => {
    for (const [path, width] of [
      ["/", 1440],
      ["/pricing", 390],
    ] as const) {
      const { win, values } = fixture(1, path, width);
      bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT);
      expect(values.size).toBe(0);
    }
  });
  it("fails to control without throwing when browser storage is denied", () => {
    const { win } = fixture();
    Object.defineProperty(win, "localStorage", {
      get: () => {
        throw new Error("Denied");
      },
    });
    expect(() =>
      bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT),
    ).not.toThrow();
    expect(
      win.document.documentElement.dataset.homeEntryVariant,
    ).toBeUndefined();
  });
  it("stops new enrollment during outcome collection and stops assignment after expiry", () => {
    const { win, values, storage } = fixture();
    win.Date.now = () => Date.parse("2026-11-03T12:00:00Z");
    bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT);
    expect(values.size).toBe(0);
    win.Date.now = () => now;
    bootstrapHomepageExperiment(win as any, HOMEPAGE_EXPERIMENT);
    expect(
      readHomepageAssignment(storage, Date.parse("2026-11-03T12:00:00Z"))
        ?.variant,
    ).toBe("b");
    expect(
      readHomepageAssignment(storage, Date.parse("2026-11-10T12:00:00Z")),
    ).toBeNull();
  });
});
