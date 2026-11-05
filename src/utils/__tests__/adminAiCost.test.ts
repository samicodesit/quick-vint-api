import { describe, expect, it } from "vitest";
import {
  summarizeDraftCostUncertainty,
  summarizeNonDraftAiCosts,
} from "../../../utils/adminAiCost";

describe("non-draft AI cost accounting", () => {
  it("includes every priced photo attempt and separates the base image and check models", () => {
    const result = summarizeNonDraftAiCosts(
      [
        {
          created_at: "2026-11-05T10:00:00Z",
          stage: "primary",
          cost_usd: 0.04,
          metrics: { model: "gpt-image-2.5-flare-2026-09-08" },
        },
        {
          created_at: "2026-11-05T10:01:00Z",
          stage: "primary_check",
          cost_usd: null,
          metrics: { model: "gpt-6.1-sol" },
        },
        {
          created_at: "2026-11-05T10:02:00Z",
          stage: "source",
          cost_usd: null,
          metrics: {},
        },
      ],
      [
        {
          created_at: "2026-11-05T11:00:00Z",
          metrics: {
            imageModel: "gpt-image-2.5-flare-2026-09-08",
            checkModel: "gpt-5.4-mini-2026-03-17",
            imageUsage: { input_tokens: 100, output_tokens: 100 },
            checkUsage: { input_tokens: 1000, output_tokens: 100 },
            estimatedCostUsd: 0.0047,
          },
        },
      ],
      [],
    );

    expect(result.modelPhoto.knownCostUsd).toBeCloseTo(0.0447, 8);
    expect(result.modelPhoto.unknownAttempts).toBe(1);
    expect(result.modelPhoto.modelBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "gpt-image-2.5-flare-2026-09-08",
          costUsd: expect.closeTo(0.0435, 8),
          callCount: 2,
        }),
        expect.objectContaining({
          model: "gpt-5.4-mini-2026-03-17",
          costUsd: expect.closeTo(0.0012, 8),
          callCount: 1,
        }),
      ]),
    );
    expect(result.daily).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-11-05",
          costUsd: expect.closeTo(0.0447, 8),
        }),
      ]),
    );
  });

  it("counts historical style calls with no usage and prices new style calls", () => {
    const result = summarizeNonDraftAiCosts(
      [],
      [],
      [
        { created_at: "2026-11-04T10:00:00Z", openai_model: null },
        {
          created_at: "2026-11-05T10:00:00Z",
          openai_model: "gpt-5.4-mini",
          openai_prompt_tokens: 1000,
          openai_completion_tokens: 100,
          openai_cached_tokens: 0,
        },
      ],
    );
    expect(result.styleLearning.unknownCalls).toBe(1);
    expect(result.styleLearning.knownCostUsd).toBeCloseTo(0.0012, 8);
  });

  it("bounds Sol calls without a recorded tier and leaves other unknown models unbounded", () => {
    const result = summarizeDraftCostUncertainty([
      {
        openai_model: "gpt-6.1-sol",
        openai_prompt_tokens: 1000,
        openai_completion_tokens: 100,
        openai_cached_tokens: 0,
        openai_billing: null,
      },
      {
        openai_model: "future-model",
        openai_prompt_tokens: 100,
        openai_completion_tokens: 10,
      },
      {
        openai_model: "gpt-6.1-sol",
        openai_prompt_tokens: 1000,
        openai_completion_tokens: 100,
        openai_billing: { serviceTier: "fast" },
      },
      { openai_model: "gpt-6.1-sol", openai_tokens_used: 1100 },
      { openai_model: "gpt-5.4", openai_tokens_used: 1100 },
    ]);
    expect(result.solMissingTierCount).toBe(1);
    expect(result.solStandardCostUsd).toBeCloseTo(0.003, 8);
    expect(result.solFastCostUsd).toBeCloseTo(0.006, 8);
    expect(result.otherUnknownCount).toBe(2);
  });
});
