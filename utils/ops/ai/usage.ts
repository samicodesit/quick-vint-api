export type ProviderUsage = {
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  imageUsage?: unknown;
  latencyMs: number;
};

export function estimateCostMinor(
  usage: ProviderUsage,
  rates: { inputPerMillionMinor: number; outputPerMillionMinor: number },
): number | null {
  if (usage.inputTokens === undefined || usage.outputTokens === undefined)
    return null;
  if (
    !Number.isSafeInteger(rates.inputPerMillionMinor) ||
    !Number.isSafeInteger(rates.outputPerMillionMinor) ||
    rates.inputPerMillionMinor < 0 ||
    rates.outputPerMillionMinor < 0
  )
    return null;
  return Math.ceil(
    (usage.inputTokens * rates.inputPerMillionMinor +
      usage.outputTokens * rates.outputPerMillionMinor) /
      1_000_000,
  );
}

export function maxReservationMinor(input: {
  maxInputTokens: number;
  maxOutputTokens: number;
  rates: { inputPerMillionMinor: number; outputPerMillionMinor: number };
}) {
  const cost = estimateCostMinor(
    {
      inputTokens: input.maxInputTokens,
      outputTokens: input.maxOutputTokens,
      latencyMs: 0,
    },
    input.rates,
  );
  if (cost === null || cost <= 0)
    throw new Error("A nonzero configured AI reservation is required");
  return cost;
}
