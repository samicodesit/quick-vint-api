import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT_SETTINGS } from "../draftContracts";
import {
  applyPreAuthStyle,
  readPreAuthStyle,
  savePreAuthStyle,
  shouldOfferStyleOnboarding,
} from "../styleOnboardingState";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    snapshot: () => Object.fromEntries(values),
  };
}
const chosen = {
  ...DEFAULT_DRAFT_SETTINGS,
  titleLanguageCode: "de",
  descriptionLanguageCode: "fr",
  descriptionLength: "short" as const,
  useBulletPoints: false,
  useHashtags: false,
  useEmojis: true,
  includeSellerNote: true,
  descriptionFooterText: "I post parcels on Tuesdays.",
};

describe("style selection before authentication", () => {
  it("preserves every selected setting across navigation and applies it before onboarding defaults", () => {
    const guest = storage();
    savePreAuthStyle(guest, chosen);
    // Navigation and a new tab preserve local storage, not module memory.
    const returned = storage(guest.snapshot());
    expect(readPreAuthStyle(returned)?.settings).toEqual(chosen);
    expect(applyPreAuthStyle(returned, "signed-in-seller")).toEqual(chosen);
    expect(
      JSON.parse(
        returned.getItem("autolister:listing-defaults:signed-in-seller")!,
      ),
    ).toEqual(chosen);
    expect(
      shouldOfferStyleOnboarding(
        returned,
        "signed-in-seller",
        "2026-10-19T12:00:00Z",
      ),
    ).toBe(false);
  });

  it("applies the latest explicit choice to its account while preserving other accounts", () => {
    const local = storage({
      "autolister:listing-defaults:seller": JSON.stringify(
        DEFAULT_DRAFT_SETTINGS,
      ),
      "autolister:listing-defaults:other": JSON.stringify(
        DEFAULT_DRAFT_SETTINGS,
      ),
    });
    savePreAuthStyle(local, DEFAULT_DRAFT_SETTINGS);
    savePreAuthStyle(local, chosen);
    expect(applyPreAuthStyle(local, "seller")).toEqual(chosen);
    expect(
      JSON.parse(local.getItem("autolister:listing-defaults:other")!),
    ).toEqual(DEFAULT_DRAFT_SETTINGS);
  });

  it("does not replace saved account preferences when the visitor skips the preview", () => {
    const local = storage({
      "autolister:listing-defaults:seller": JSON.stringify(chosen),
    });
    savePreAuthStyle(local, null);
    expect(applyPreAuthStyle(local, "seller")).toBeNull();
    expect(
      JSON.parse(local.getItem("autolister:listing-defaults:seller")!),
    ).toEqual(chosen);
    expect(
      shouldOfferStyleOnboarding(local, "seller", "2026-10-19T12:00:00Z"),
    ).toBe(false);
  });

  it("never reapplies a consumed choice after edits, reloads, or signing in to another account", () => {
    const local = storage();
    savePreAuthStyle(local, chosen);
    applyPreAuthStyle(local, "seller");
    local.setItem(
      "autolister:listing-defaults:seller",
      JSON.stringify(DEFAULT_DRAFT_SETTINGS),
    );
    const reload = storage(local.snapshot());
    expect(applyPreAuthStyle(reload, "seller")).toBeNull();
    expect(applyPreAuthStyle(reload, "other")).toBeNull();
    expect(
      JSON.parse(reload.getItem("autolister:listing-defaults:seller")!),
    ).toEqual(DEFAULT_DRAFT_SETTINGS);
    expect(reload.getItem("autolister:listing-defaults:other")).toBeNull();
    expect(readPreAuthStyle(reload)).toBeNull();
  });

  it("does not acknowledge a style when durable storage is blocked or silently drops writes", () => {
    expect(() =>
      savePreAuthStyle({ getItem: () => null, setItem: () => {} }, chosen),
    ).toThrow();
    expect(() =>
      savePreAuthStyle(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("blocked");
          },
        },
        chosen,
      ),
    ).toThrow();
  });

  it("retains a failed handoff for its original account and safely retries it", () => {
    const local = storage();
    savePreAuthStyle(local, chosen);
    const failed = {
      ...local,
      setItem(key: string, value: string) {
        if (key === "autolister:listing-defaults:seller")
          throw new Error("quota");
        local.setItem(key, value);
      },
    };
    expect(() => applyPreAuthStyle(failed, "seller")).toThrow("quota");
    expect(applyPreAuthStyle(local, "other")).toBeNull();
    expect(local.getItem("autolister:listing-defaults:other")).toBeNull();
    expect(applyPreAuthStyle(local, "seller")).toEqual(chosen);
  });

  it("validates the full style before saving and ignores malformed pending data", () => {
    const local = storage();
    expect(() =>
      savePreAuthStyle(local, {
        ...chosen,
        descriptionFooterText: "x".repeat(241),
      }),
    ).toThrow();
    expect(readPreAuthStyle(local)).toBeNull();
    expect(applyPreAuthStyle(local, "seller")).toBeNull();
  });
});
