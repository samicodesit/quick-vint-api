import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT_SETTINGS } from "../draftContracts";
import { readFormattingPreferences } from "../formatting";
import {
  shouldOfferStyleOnboarding,
  saveOnboardingStyle,
} from "../styleOnboardingState";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("first web listing style", () => {
  it("uses Short for fresh web preferences and preserves an explicit Long choice", () => {
    expect(readFormattingPreferences(storage()).descriptionLength).toBe(
      "short",
    );
    expect(
      readFormattingPreferences(storage({ descriptionLength: "long" }))
        .descriptionLength,
    ).toBe("long");
  });
  it("offers the setup to new accounts once, without interrupting older accounts or replacing defaults", () => {
    expect(
      shouldOfferStyleOnboarding(storage(), "new", "2026-10-16T00:00:00Z"),
    ).toBe(true);
    expect(
      shouldOfferStyleOnboarding(storage(), "old", "2026-10-12T00:00:00Z"),
    ).toBe(false);
    expect(shouldOfferStyleOnboarding(storage(), "unknown", undefined)).toBe(
      false,
    );
    expect(
      shouldOfferStyleOnboarding(
        storage({
          "autolister:listing-defaults:new": JSON.stringify(
            DEFAULT_DRAFT_SETTINGS,
          ),
        }),
        "new",
        "2026-10-16T00:00:00Z",
      ),
    ).toBe(false);
    expect(
      shouldOfferStyleOnboarding(
        storage({ "autolister:style-setup:v1:new": "done" }),
        "new",
        "2026-10-16T00:00:00Z",
      ),
    ).toBe(false);
  });
  it("saves actual draft settings per account and never seeds an example seller note", () => {
    const target = storage();
    const chosen = {
      ...DEFAULT_DRAFT_SETTINGS,
      titleLanguageCode: "fr",
      descriptionLanguageCode: "nl",
      descriptionLength: "short" as const,
      useHashtags: true,
      useEmojis: true,
    };
    saveOnboardingStyle(target, "seller", chosen);
    expect(
      JSON.parse(target.getItem("autolister:listing-defaults:seller")!),
    ).toEqual(chosen);
    expect(target.getItem("autolister:style-setup:v1:seller")).toBe("done");
    expect(target.getItem("autolister:listing-defaults:other")).toBeNull();
    expect(chosen.descriptionFooterText).toBe("");
  });
  it("rejects invalid notes before persisting or marking the setup complete", () => {
    const target = storage();
    expect(() =>
      saveOnboardingStyle(target, "seller", {
        ...DEFAULT_DRAFT_SETTINGS,
        descriptionFooterText: "x".repeat(241),
      }),
    ).toThrow();
    expect(target.getItem("autolister:style-setup:v1:seller")).toBeNull();
  });
});
