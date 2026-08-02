import { describe, expect, it } from "vitest";

import {
  isAiStyleLearningPage,
  shouldRunAiStyleLearning,
} from "../../../utils/aiStyleLearning";

describe("isAiStyleLearningPage", () => {
  it.each([
    "/items/new",
    "/items/new/",
    "https://www.vinted.com/items/new",
    "https://www.vinted.fr/items/new/",
  ])("allows new-listing page %s", (page) => {
    expect(isAiStyleLearningPage(page)).toBe(true);
  });

  it.each([
    "/items/123/edit",
    "https://www.vinted.com/items/123/edit",
    "/member/signup/select_type",
    "not a url",
    "",
    null,
    undefined,
  ])("rejects non-new-listing page %s", (page) => {
    expect(isAiStyleLearningPage(page)).toBe(false);
  });
});

describe("shouldRunAiStyleLearning", () => {
  it("learns from every edited free listing while a trial generation remains", () => {
    expect(
      shouldRunAiStyleLearning({
        effectiveTier: "free",
        remainingFreeGenerations: 2,
        generationAttemptId: "free-edit-1",
        lastAnalyzedAttemptIds: [],
        recentGenerationAttemptIds: [],
        editedAttemptIdsSinceLastAnalysis: [],
      }),
    ).toBe(true);
  });

  it("does not spend a learning call after the final free generation", () => {
    expect(
      shouldRunAiStyleLearning({
        effectiveTier: "free",
        remainingFreeGenerations: 0,
        generationAttemptId: "free-edit-5",
        lastAnalyzedAttemptIds: [],
        recentGenerationAttemptIds: [],
        editedAttemptIdsSinceLastAnalysis: [],
      }),
    ).toBe(false);
  });

  it("learns from a paid seller's first edited listing", () => {
    expect(
      shouldRunAiStyleLearning({
        effectiveTier: "starter",
        remainingFreeGenerations: 0,
        generationAttemptId: "paid-edit-1",
        lastAnalyzedAttemptIds: [],
        recentGenerationAttemptIds: ["paid-edit-1"],
        editedAttemptIdsSinceLastAnalysis: [],
      }),
    ).toBe(true);
  });

  it("relearns for paid sellers only after three new edits within their latest five listings", () => {
    expect(
      shouldRunAiStyleLearning({
        effectiveTier: "pro",
        remainingFreeGenerations: 0,
        generationAttemptId: "g5",
        lastAnalyzedAttemptIds: ["g1"],
        recentGenerationAttemptIds: ["g1", "g2", "g3", "g4", "g5"],
        editedAttemptIdsSinceLastAnalysis: ["g2", "g3", "g5"],
      }),
    ).toBe(true);
  });

  it("does not relearn for paid sellers when the three edits are not all in the latest five listings", () => {
    expect(
      shouldRunAiStyleLearning({
        effectiveTier: "business",
        remainingFreeGenerations: 0,
        generationAttemptId: "g6",
        lastAnalyzedAttemptIds: ["g1"],
        recentGenerationAttemptIds: ["g2", "g3", "g4", "g5", "g6"],
        editedAttemptIdsSinceLastAnalysis: ["g1", "g2", "g3"],
      }),
    ).toBe(false);
  });
});
