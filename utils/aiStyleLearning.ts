type AiStyleLearningEligibility = {
  effectiveTier: string;
  remainingFreeGenerations: number;
  generationAttemptId: string;
  lastAnalyzedAttemptIds: string[];
};

export function isAiStyleLearningPage(page: unknown) {
  if (typeof page !== "string" || !page.trim()) return false;
  try {
    const pathname = new URL(page, "https://autolister.invalid").pathname;
    return pathname.replace(/\/+$/, "") === "/items/new";
  } catch {
    return false;
  }
}

export function shouldRunAiStyleLearning({
  effectiveTier,
  remainingFreeGenerations,
  generationAttemptId,
  lastAnalyzedAttemptIds,
}: AiStyleLearningEligibility) {
  if (
    !generationAttemptId ||
    lastAnalyzedAttemptIds.includes(generationAttemptId)
  ) {
    return false;
  }

  return effectiveTier === "free" && remainingFreeGenerations > 0;
}
