import { describe, expect, it } from "vitest";
import { applyModelContentHold } from "../modelContentRelease";

describe("model content release hold", () => {
  it("holds the campaign while preserving existing public posts", () => {
    expect(
      applyModelContentHold(
        { draft: false, releaseGroup: "model-photos" },
        false,
      ).draft,
    ).toBe(true);
    expect(applyModelContentHold({ draft: false }, false).draft).toBe(false);
  });
  it("releases reviewed campaign posts without exposing unrelated drafts", () => {
    expect(
      applyModelContentHold(
        { draft: false, releaseGroup: "model-photos" },
        true,
      ).draft,
    ).toBe(false);
    expect(applyModelContentHold({ draft: true }, true).draft).toBe(true);
  });
});
