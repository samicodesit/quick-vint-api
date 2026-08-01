type AiStyleLearningEligibility = {
  effectiveTier: string;
  remainingFreeGenerations: number;
  generationAttemptId: string;
  lastAnalyzedAttemptIds: string[];
  recentGenerationAttemptIds: string[];
  editedAttemptIdsSinceLastAnalysis: string[];
};

export function shouldRunAiStyleLearning({
  effectiveTier,
  remainingFreeGenerations,
  generationAttemptId,
  lastAnalyzedAttemptIds,
  recentGenerationAttemptIds,
  editedAttemptIdsSinceLastAnalysis,
}: AiStyleLearningEligibility) {
  if (
    !generationAttemptId ||
    lastAnalyzedAttemptIds.includes(generationAttemptId)
  ) {
    return false;
  }

  if (effectiveTier === "free") return remainingFreeGenerations > 0;
  if (!lastAnalyzedAttemptIds.length) return true;

  const recent = new Set(recentGenerationAttemptIds);
  const newRecentEdits = new Set(
    editedAttemptIdsSinceLastAnalysis.filter((id) => recent.has(id)),
  );
  return newRecentEdits.size >= 3;
}
