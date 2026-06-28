export type OpenAIModelExperimentArm = {
  key: string;
  model: string;
  weight: number;
};

export type OpenAIModelSelection = {
  key: string;
  model: string;
  bucket: number;
  arms: OpenAIModelExperimentArm[];
};

export type OpenAIModelPricing = {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
};

export const OPENAI_CONTROL_MODEL = "gpt-4o";

export const DEFAULT_OPENAI_MODEL_EXPERIMENT = "quality:gpt-5.4:100";

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
};

export function parseOpenAIModelExperiment(
  spec = process.env.OPENAI_MODEL_EXPERIMENT || DEFAULT_OPENAI_MODEL_EXPERIMENT,
): OpenAIModelExperimentArm[] {
  if (!spec || spec.trim().toLowerCase() === "off") {
    return [{ key: "control", model: OPENAI_CONTROL_MODEL, weight: 100 }];
  }

  const arms = spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, model, weightValue] = part
        .split(":")
        .map((item) => item.trim());
      const weight = Number(weightValue);
      if (!key || !model || !Number.isFinite(weight) || weight <= 0) {
        return null;
      }
      return { key, model, weight };
    })
    .filter((arm): arm is OpenAIModelExperimentArm => Boolean(arm));

  return arms.length
    ? arms
    : [{ key: "control", model: OPENAI_CONTROL_MODEL, weight: 100 }];
}

export function stableUnitBucket(seed: string, salt = "openai-model-v1") {
  const input = `${salt}:${seed}`;
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 2 ** 32;
}

export function selectOpenAIModel({
  seed,
  salt = process.env.OPENAI_MODEL_EXPERIMENT_SALT || "openai-model-v1",
  spec,
}: {
  seed: string;
  salt?: string;
  spec?: string;
}): OpenAIModelSelection {
  const arms = parseOpenAIModelExperiment(spec);
  const totalWeight = arms.reduce((sum, arm) => sum + arm.weight, 0);
  const bucket = stableUnitBucket(seed || "anonymous", salt);
  const target = bucket * totalWeight;
  let cumulative = 0;

  for (const arm of arms) {
    cumulative += arm.weight;
    if (target < cumulative) {
      return { ...arm, bucket, arms };
    }
  }

  const fallbackArm = arms[arms.length - 1] || {
    key: "control",
    model: OPENAI_CONTROL_MODEL,
    weight: 100,
  };
  return { ...fallbackArm, bucket, arms };
}

export function isOpenAIModelCompatibilityError(error: any) {
  const message = String(error?.message || "");
  return (
    error?.status === 400 &&
    /model|unsupported|not supported|does not exist|unrecognized|max_tokens|max_completion_tokens|temperature|response_format/i.test(
      message,
    )
  );
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
    return ((totalTokens || 0) * 0.5) / 1_000_000;
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
