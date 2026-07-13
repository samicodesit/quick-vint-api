import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_MODEL_EXPERIMENT,
  estimateOpenAICostUsd,
  findOpenAIExperimentArmForModel,
  getOpenAIChatTemperatureParam,
  getBillableOpenAIModel,
  getOpenAIChatTokenLimitParam,
  isOpenAIModelCompatibilityError,
  parseOpenAIModelExperiment,
  selectOpenAIModel,
  stableUnitBucket,
} from "../../../utils/openaiModelExperiment";

describe("openaiModelExperiment", () => {
  it("defaults to a stable control vs Luna high-detail experiment", () => {
    expect(parseOpenAIModelExperiment(DEFAULT_OPENAI_MODEL_EXPERIMENT)).toEqual(
      [
        { key: "control", model: "gpt-5.4", weight: 50, imageDetail: "low" },
        {
          key: "luna_high",
          model: "gpt-5.6-luna",
          weight: 50,
          imageDetail: "high",
        },
      ],
    );
  });

  it("parses weighted model arms with image detail", () => {
    expect(
      parseOpenAIModelExperiment(
        "control:gpt-4o:40:low,quality:gpt-5.4:45:high,mini:gpt-5.4-mini:15:auto",
      ),
    ).toEqual([
      { key: "control", model: "gpt-4o", weight: 40, imageDetail: "low" },
      { key: "quality", model: "gpt-5.4", weight: 45, imageDetail: "high" },
      { key: "mini", model: "gpt-5.4-mini", weight: 15, imageDetail: "auto" },
    ]);
  });

  it("defaults image detail to low when an arm omits or misspells it", () => {
    expect(parseOpenAIModelExperiment("a:gpt-4o:50,b:gpt-5.4:50:huge")).toEqual(
      [
        { key: "a", model: "gpt-4o", weight: 50, imageDetail: "low" },
        { key: "b", model: "gpt-5.4", weight: 50, imageDetail: "low" },
      ],
    );
  });

  it("falls back to the control model when disabled or invalid", () => {
    expect(parseOpenAIModelExperiment("off")).toEqual([
      { key: "control", model: "gpt-4o", weight: 100, imageDetail: "low" },
    ]);
    expect(parseOpenAIModelExperiment("bad")).toEqual([
      { key: "control", model: "gpt-4o", weight: 100, imageDetail: "low" },
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

  it("omits temperature for chat models that only accept the default", () => {
    expect(getOpenAIChatTemperatureParam("gpt-5.6-luna", 0.3)).toEqual({});
    expect(getOpenAIChatTemperatureParam("gpt-5.4", 0.3)).toEqual({
      temperature: 0.3,
    });
  });

  it("finds the configured experiment arm for a logged model", () => {
    const spec = "control:gpt-5.4:50:low,luna_high:gpt-5.6-luna:50:high";

    expect(findOpenAIExperimentArmForModel("gpt-5.6-luna", spec)).toEqual({
      key: "luna_high",
      model: "gpt-5.6-luna",
      weight: 50,
      imageDetail: "high",
    });
    expect(findOpenAIExperimentArmForModel("gpt-5.4->gpt-4o", spec)).toBeNull();
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

    expect(
      estimateOpenAICostUsd({
        model: "gpt-5.4",
        promptTokens: 1000,
        completionTokens: 200,
        cachedTokens: 100,
      }),
    ).toBeCloseTo(0.005875);

    expect(
      estimateOpenAICostUsd({
        model: "gpt-5.6-luna",
        promptTokens: 1000,
        completionTokens: 200,
        cachedTokens: 100,
      }),
    ).toBeCloseTo(0.00211);
  });

  it("does not invent a cost for unknown model pricing", () => {
    expect(
      estimateOpenAICostUsd({
        model: "future-model",
        totalTokens: 1000,
      }),
    ).toBeNull();
  });

  it("uses the final fallback model for cost lookup", () => {
    expect(getBillableOpenAIModel("gpt-5.4->gpt-4o")).toBe("gpt-4o");
  });
});
