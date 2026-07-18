import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_MODEL,
  estimateOpenAICostUsd,
  getOpenAIChatTemperatureParam,
  getBillableOpenAIModel,
  getOpenAIChatTokenLimitParam,
} from "../../../utils/openaiModelExperiment";

describe("openaiModelExperiment", () => {
  it("defaults generation to gpt-5.4", () => {
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5.4");
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
