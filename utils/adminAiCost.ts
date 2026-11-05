import { photoCost } from "./listingPhotoGeneration";
import {
  estimateOpenAICostUsd,
  getBillableOpenAIModel,
} from "./openaiModelExperiment";

type CostMetrics = Record<string, any> | null;
type ListingPhotoAttempt = {
  created_at: string;
  stage: string;
  cost_usd?: number | null;
  metrics?: CostMetrics;
};
type UserModelAttempt = {
  created_at: string;
  metrics?: CostMetrics;
};
type StyleLearningLog = {
  created_at: string;
  openai_model?: string | null;
  openai_prompt_tokens?: number | null;
  openai_completion_tokens?: number | null;
  openai_cached_tokens?: number | null;
};

type DraftCostLog = Omit<StyleLearningLog, "created_at"> & {
  openai_billing?: unknown;
  openai_tokens_used?: number | null;
};

export function summarizeDraftCostUncertainty(logs: DraftCostLog[]) {
  let solMissingTierCount = 0;
  let solStandardCostUsd = 0;
  let solFastCostUsd = 0;
  let otherUnknownCount = 0;
  for (const log of logs) {
    const billing =
      log.openai_billing && typeof log.openai_billing === "object"
        ? (log.openai_billing as {
            serviceTier?: string;
            cacheWriteTokens?: number;
          })
        : null;
    const splitTokens =
      Number(log.openai_prompt_tokens || 0) +
      Number(log.openai_completion_tokens || 0);
    if (splitTokens <= 0 && Number(log.openai_tokens_used || 0) <= 0) continue;
    if (splitTokens <= 0) {
      if (
        estimateOpenAICostUsd({
          model: log.openai_model,
          totalTokens: log.openai_tokens_used,
          serviceTier: billing?.serviceTier,
        }) === null
      )
        otherUnknownCount += 1;
      continue;
    }
    const common = {
      model: log.openai_model,
      promptTokens: log.openai_prompt_tokens,
      completionTokens: log.openai_completion_tokens,
      cachedTokens: log.openai_cached_tokens,
      cacheWriteTokens: billing?.cacheWriteTokens,
    };
    if (
      estimateOpenAICostUsd({
        ...common,
        serviceTier: billing?.serviceTier,
      }) !== null
    )
      continue;
    if (
      getBillableOpenAIModel(log.openai_model) === "gpt-6.1-sol" &&
      !billing?.serviceTier
    ) {
      const standard = estimateOpenAICostUsd({
        ...common,
        serviceTier: "default",
      });
      const fast = estimateOpenAICostUsd({ ...common, serviceTier: "fast" });
      if (standard !== null && fast !== null) {
        solMissingTierCount += 1;
        solStandardCostUsd += standard;
        solFastCostUsd += fast;
        continue;
      }
    }
    otherUnknownCount += 1;
  }
  return {
    solMissingTierCount,
    solStandardCostUsd,
    solFastCostUsd,
    otherUnknownCount,
  };
}

export function summarizeNonDraftAiCosts(
  listingAttempts: ListingPhotoAttempt[],
  modelAttempts: UserModelAttempt[],
  styleLogs: StyleLearningLog[],
) {
  const modelMap = new Map<
    string,
    {
      model: string;
      costUsd: number;
      callCount: number;
      unknownCallCount: number;
    }
  >();
  const dailyMap = new Map<string, number>();
  const addDaily = (date: string, cost: number) => {
    const day = date.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + cost);
  };
  const addModel = (model: string, cost: number | null) => {
    const key = model || "unknown";
    const entry = modelMap.get(key) || {
      model: key,
      costUsd: 0,
      callCount: 0,
      unknownCallCount: 0,
    };
    entry.callCount += 1;
    if (cost === null) entry.unknownCallCount += 1;
    else entry.costUsd += cost;
    modelMap.set(key, entry);
  };

  let listingCostUsd = 0;
  let baseModelCostUsd = 0;
  let unknownAttempts = 0;
  for (const attempt of listingAttempts) {
    if (attempt.stage === "source") continue;
    const cost =
      typeof attempt.cost_usd === "number" &&
      Number.isFinite(attempt.cost_usd) &&
      attempt.cost_usd >= 0
        ? attempt.cost_usd
        : null;
    addModel(String(attempt.metrics?.model || "unknown"), cost);
    if (cost === null) unknownAttempts += 1;
    else {
      listingCostUsd += cost;
      addDaily(attempt.created_at, cost);
    }
  }

  for (const attempt of modelAttempts) {
    const metrics = attempt.metrics || {};
    const imageModel = String(metrics.imageModel || "unknown");
    const checkModel = String(metrics.checkModel || "unknown");
    const imageCost =
      imageModel === "gpt-image-2.5-flare-2026-09-08" && metrics.imageUsage
        ? photoCost("image", metrics.imageUsage, imageModel)
        : null;
    const checkCost =
      checkModel === "gpt-5.4-mini-2026-03-17" && metrics.checkUsage
        ? photoCost("check", metrics.checkUsage, checkModel)
        : null;
    addModel(imageModel, imageCost);
    addModel(checkModel, checkCost);
    if (imageCost === null || checkCost === null) unknownAttempts += 1;
    const knownCost = (imageCost || 0) + (checkCost || 0);
    baseModelCostUsd += knownCost;
    addDaily(attempt.created_at, knownCost);
  }

  let styleCostUsd = 0;
  let unknownStyleCalls = 0;
  for (const log of styleLogs) {
    const cost =
      Number(log.openai_prompt_tokens || 0) +
        Number(log.openai_completion_tokens || 0) >
      0
        ? estimateOpenAICostUsd({
            model: log.openai_model,
            promptTokens: log.openai_prompt_tokens,
            completionTokens: log.openai_completion_tokens,
            cachedTokens: log.openai_cached_tokens,
          })
        : null;
    if (cost === null) unknownStyleCalls += 1;
    else {
      styleCostUsd += cost;
      addDaily(log.created_at, cost);
    }
  }

  return {
    modelPhoto: {
      knownCostUsd: listingCostUsd + baseModelCostUsd,
      listingCostUsd,
      baseModelCostUsd,
      unknownAttempts,
      modelBreakdown: [...modelMap.values()].sort(
        (a, b) => b.costUsd - a.costUsd,
      ),
    },
    styleLearning: {
      knownCostUsd: styleCostUsd,
      unknownCalls: unknownStyleCalls,
    },
    daily: [...dailyMap]
      .map(([date, costUsd]) => ({ date, costUsd }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
