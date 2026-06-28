import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_MODEL_EXPERIMENT,
  estimateOpenAICostUsd,
  getOpenAIChatTokenLimitParam,
  isOpenAIModelCompatibilityError,
  parseOpenAIModelExperiment,
  selectOpenAIModel,
  stableUnitBucket,
} from "../../../utils/openaiModelExperiment";

describe("openaiModelExperiment", () => {
  it("defaults to the best-fit quality model for low-traffic production", () => {
    expect(
      parseOpenAIModelExperiment(DEFAULT_OPENAI_MODEL_EXPERIMENT),
    ).toEqual([{ key: "quality", model: "gpt-5.4", weight: 100 }]);
  });

  it("parses weighted model arms", () => {
    expect(
      parseOpenAIModelExperiment(
        "control:gpt-4o:40,quality:gpt-5.4:45,mini:gpt-5.4-mini:15",
      ),
    ).toEqual([
      { key: "control", model: "gpt-4o", weight: 40 },
      { key: "quality", model: "gpt-5.4", weight: 45 },
      { key: "mini", model: "gpt-5.4-mini", weight: 15 },
    ]);
  });

  it("falls back to the control model when disabled or invalid", () => {
    expect(parseOpenAIModelExperiment("off")).toEqual([
      { key: "control", model: "gpt-4o", weight: 100 },
    ]);
    expect(parseOpenAIModelExperiment("bad")).toEqual([
      { key: "control", model: "gpt-4o", weight: 100 },
    ]);
  });

  it("selects a stable model for the same user and salt", () => {
    const first = selectOpenAIModel({
      seed: "user-123",
      salt: "test",
      spec: "a:gpt-4o:50,b:gpt-5.4-mini:50",
    });
    const second = selectOpenAIModel({
      seed: "user-123",
      salt: "test",
      spec: "a:gpt-4o:50,b:gpt-5.4-mini:50",
    });

    expect(first).toMatchObject(second);
    expect(stableUnitBucket("user-123", "test")).toBeGreaterThanOrEqual(0);
    expect(stableUnitBucket("user-123", "test")).toBeLessThan(1);
  });

  it("detects model compatibility errors", () => {
    expect(
      isOpenAIModelCompatibilityError({
        status: 400,
        message: "The model `gpt-x` does not exist",
      }),
    ).toBe(true);
    expect(
      isOpenAIModelCompatibilityError({
        status: 429,
        message: "Rate limit reached",
      }),
    ).toBe(false);
  });

  it("uses the token limit parameter supported by each chat model family", () => {
    expect(getOpenAIChatTokenLimitParam("gpt-5.4", 900)).toEqual({
      max_completion_tokens: 900,
    });
    expect(getOpenAIChatTokenLimitParam("gpt-5.4-mini", 900)).toEqual({
      max_completion_tokens: 900,
    });
    expect(getOpenAIChatTokenLimitParam("gpt-4o", 900)).toEqual({
      max_tokens: 900,
    });
  });

  it("estimates cost from token breakdown and model pricing", () => {
    expect(
      estimateOpenAICostUsd({
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 200,
        cachedTokens: 100,
      }),
    ).toBeCloseTo(0.004375);

    expect(
      estimateOpenAICostUsd({
        model: "gpt-5.4-mini",
        promptTokens: 1000,
        completionTokens: 200,
        cachedTokens: 100,
      }),
    ).toBeCloseTo(0.0015825);
  });
});
