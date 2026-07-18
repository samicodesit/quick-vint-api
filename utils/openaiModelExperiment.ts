export type OpenAIImageDetail = "low" | "high" | "auto";

export type OpenAIModelPricing = {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
};

export const DEFAULT_OPENAI_MODEL = "gpt-5.4";
export const DEFAULT_OPENAI_IMAGE_DETAIL: OpenAIImageDetail = "low";

export const OPENAI_MODEL_PRICING_USD_PER_MILLION: Record<
  string,
  OpenAIModelPricing
> = {
  "gpt-4o": {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 1.25,
    outputPerMillion: 10,
  },
  "gpt-5.4-mini": {
    inputPerMillion: 0.75,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 4.5,
  },
  "gpt-5.4": {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
  },
  "gpt-5.6-luna": {
    inputPerMillion: 1,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 6,
  },
  "gpt-5.6-terra": {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
  },
  "gpt-5.6-sol": {
    inputPerMillion: 5,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 30,
  },
};

export function getOpenAIChatTokenLimitParam(
  model: string,
  maxOutputTokens: number,
) {
  const safeMaxOutputTokens = Math.max(1, Math.floor(maxOutputTokens));
  if (/^gpt-5(?:[.-]|$)/.test(model)) {
    return { max_completion_tokens: safeMaxOutputTokens };
  }

  return { max_tokens: safeMaxOutputTokens };
}

export function getOpenAIChatTemperatureParam(
  model: string,
  temperature: number,
) {
  if (/^gpt-5\.6(?:[.-]|$)/.test(model)) return {};
  return { temperature };
}

export function estimateOpenAICostUsd({
  model,
  promptTokens = 0,
  completionTokens = 0,
  cachedTokens = 0,
  totalTokens,
}: {
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
}) {
  const normalizedModel =
    String(model || "")
      .split("->")
      .pop()
      ?.trim() || "";
  const pricing = OPENAI_MODEL_PRICING_USD_PER_MILLION[normalizedModel];

  if (!pricing) {
    return null;
  }

  const safePromptTokens = Math.max(0, Number(promptTokens || 0));
  const safeCompletionTokens = Math.max(0, Number(completionTokens || 0));
  const safeCachedTokens = Math.min(
    safePromptTokens,
    Math.max(0, Number(cachedTokens || 0)),
  );
  const uncachedInputTokens = Math.max(0, safePromptTokens - safeCachedTokens);

  if (!safePromptTokens && !safeCompletionTokens && totalTokens) {
    return (Number(totalTokens) * pricing.inputPerMillion) / 1_000_000;
  }

  return (
    (uncachedInputTokens * pricing.inputPerMillion +
      safeCachedTokens * pricing.cachedInputPerMillion +
      safeCompletionTokens * pricing.outputPerMillion) /
    1_000_000
  );
}

export function getBillableOpenAIModel(model?: string | null) {
  return (
    String(model || "")
      .split("->")
      .pop()
      ?.trim() || ""
  );
}
