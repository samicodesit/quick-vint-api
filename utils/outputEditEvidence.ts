import { redact } from "./incidents/contract";

// Business evidence only. Never add listing copy to the diagnostic allowlist.
// JSON-encoded text is at most 7 KiB, without duplicate snapshots or photos.
export function outputEditEvidence(raw: any, safe: Record<string, any>) {
  const context: Record<string, any> = {};
  for (const key of [
    "generationAttemptId",
    "generationRequestId",
    "operationId",
    "outputTrackingId",
    "analyticsClientId",
    "mode",
    "photoCount",
    "titleLanguageCode",
    "descriptionLanguageCode",
    "descriptionApplyChoice",
    "editSequence",
    "editSnapshotReason",
    "editDelayMs",
    "titleChanged",
    "descriptionChanged",
    "titleLengthDelta",
    "descriptionLengthDelta",
    "editEventCount",
    "titleEditEventCount",
    "descriptionEditEventCount",
    "editDurationMs",
    "editIdleMs",
    "summaryLimit",
  ])
    if (safe[key] !== undefined) context[key] = safe[key];
  const truncated: string[] = [];
  // Any business event can carry the queue's one-shot drop counters.
  for (const [key, value] of Object.entries(safe))
    if (key.startsWith("queueDropped") || key === "queueDropLastRejection")
      context[key] = value;
  let redacted = false;
  for (const [key, budget] of Object.entries({
    generatedTitle: 512,
    finalTitle: 512,
    generatedDescription: 3072,
    finalDescription: 3072,
  })) {
    const input = raw?.[key];
    if (typeof input !== "string") continue;
    const cleaned = redact(input, input.length);
    redacted ||= cleaned !== input;
    if (Buffer.byteLength(JSON.stringify(cleaned)) - 2 <= budget) {
      context[key] = cleaned;
      continue;
    }
    let value = "";
    let bytes = 0;
    for (const char of cleaned) {
      const size = Buffer.byteLength(JSON.stringify(char)) - 2;
      if (bytes + size > budget) break;
      bytes += size;
      value += char;
    }
    context[key] = value;
    if (value.length < cleaned.length) truncated.push(key);
  }
  context.textCaptureVersion = 1;
  if (truncated.length) context.textTruncatedFields = truncated;
  if (redacted) context.textRedacted = true;
  return context;
}
