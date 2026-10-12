import { describe, expect, it } from "vitest";
import { canSuggestExtension } from "../extensionSuggestion";

const desktop = "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36";
describe("extension suggestion eligibility", () => {
  it("allows desktop Chrome after the full seven-day cooldown", () => {
    const shown = 1000;
    const until = shown + 7 * 86400000;
    expect(canSuggestExtension(desktop, 1200, until, until - 1)).toBe(false);
    expect(canSuggestExtension(desktop, 1200, until, until)).toBe(true);
  });
  it.each([
    [desktop, 390],
    [desktop + " Android", 1200],
    [desktop + " iPhone", 1200],
    [desktop + " iPad", 1200],
    [desktop + " Mobile", 1200],
    [desktop + " Edg/140", 1200],
    ["Mozilla/5.0 Firefox/140", 1200],
    ["Mozilla/5.0 Version/18 Safari/605", 1200],
  ])("skips unsupported browser or phone: %s at %s", (ua, width) => {
    expect(canSuggestExtension(ua, width, 0)).toBe(false);
  });
  it("suppresses a corrupt cooldown instead of repeatedly prompting", () => {
    expect(canSuggestExtension(desktop, 1200, NaN)).toBe(false);
  });
});
