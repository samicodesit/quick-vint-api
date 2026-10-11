import { describe, expect, it } from "vitest";
import {
  DRAFT_LIMITS,
  validateDraftAction,
  normalizeDraftSettings,
} from "../draftContracts";
describe("draft action boundaries", () => {
  it("rejects invalid IDs, unsafe settings and excess photo counts", () => {
    expect(() =>
      validateDraftAction("detail", { draftId: "not-an-id" }),
    ).toThrow();
    expect(() =>
      validateDraftAction("create", { settings: { titleLanguageCode: "xx" } }),
    ).toThrow();
    expect(() =>
      validateDraftAction("grant", {
        photoId: crypto.randomUUID(),
        importId: crypto.randomUUID(),
        bytes: DRAFT_LIMITS.uploadBytes + 1,
      }),
    ).toThrow();
  });
  it("does not expose internal generation transitions to the action API", () => {
    for (const action of [
      "claim",
      "bind",
      "pending",
      "complete",
      "fail",
      "cleanup",
    ])
      expect(() => validateDraftAction(action, {})).toThrow();
  });
  it("requires an explicit version for edits and keeps exact edited whitespace", () => {
    expect(() =>
      validateDraftAction("save", { draftId: crypto.randomUUID(), title: "x" }),
    ).toThrow();
    const input = {
      draftId: crypto.randomUUID(),
      expectedVersion: 1,
      description: "  Measurements\n\nChest: 50 cm\n",
    };
    expect(validateDraftAction("save", input)).toEqual(input);
  });
});

describe("complete per-item listing settings", () => {
  const legacy = {
    titleLanguageCode: "en",
    descriptionLanguageCode: "fr",
    descriptionLength: "short",
    useBulletPoints: false,
  };
  it("keeps old drafts readable without silently enabling extras", () => {
    expect(normalizeDraftSettings(legacy)).toMatchObject({
      ...legacy,
      tone: "standard",
      useHashtags: false,
      useEmojis: false,
      includeSellerNote: false,
      descriptionFooterText: "",
    });
  });
  it("accepts all four tones and preserves an excluded seller note", () => {
    for (const tone of [
      "standard",
      "friendly",
      "professional",
      "enthusiastic",
    ]) {
      const settings = {
        ...legacy,
        tone,
        useHashtags: true,
        useEmojis: true,
        includeSellerNote: false,
        descriptionFooterText: "  Happy to bundle.\n",
      };
      expect(validateDraftAction("create", { settings }).settings).toEqual(
        settings,
      );
      expect(normalizeDraftSettings(settings).descriptionFooterText).toBe(
        settings.descriptionFooterText,
      );
    }
  });
  it("rejects unknown tones, nonboolean switches and invalid notes even when excluded", () => {
    for (const change of [
      { tone: "salesy" },
      { useHashtags: "yes" },
      { includeSellerNote: "no" },
      { descriptionFooterText: "x".repeat(241) },
      { descriptionFooterText: "Email me: seller@example.com" },
    ]) {
      expect(() =>
        validateDraftAction("create", { settings: { ...legacy, ...change } }),
      ).toThrow();
    }
  });
});
