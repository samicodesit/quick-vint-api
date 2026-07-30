export const AI_INSTRUCTIONS_MAX_LENGTH = 1000;

export type AiInstructionsValidation =
  | { ok: true; text: string | null }
  | { ok: false; error: string };

export function validateAiInstructions(
  value: unknown,
): AiInstructionsValidation {
  if (value === undefined || value === null || value === "") {
    return { ok: true, text: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "AI instructions must be plain text." };
  }

  const text = value.trim();
  if (text.length > AI_INSTRUCTIONS_MAX_LENGTH) {
    return {
      ok: false,
      error: `AI instructions must be ${AI_INSTRUCTIONS_MAX_LENGTH} characters or less.`,
    };
  }

  return { ok: true, text: text || null };
}
