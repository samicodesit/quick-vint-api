import { OpenAI } from "openai";
import { validateAiInstructions } from "./aiInstructions";

type Example = {
  generatedTitle: string;
  generatedDescription: string;
  finalTitle: string;
  finalDescription: string;
};

export async function suggestAiStyle({
  currentInstructions,
  examples,
}: {
  currentInstructions: string | null;
  examples: Example[];
}) {
  const openai = new OpenAI({
    apiKey: process.env.VERCEL_APP_OPENAI_API_KEY,
  });
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    temperature: 0,
    max_completion_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You learn durable seller writing preferences from complete generated-to-final listing snapshots. Return JSON only: {"action":"no_change|append|refine|replace","aiInstructions":string|null,"reason":string}. Be conservative. Ignore a factual substitution as preference evidence, such as one brand, category, size, material, or condition changing to another; it is an item correction. That rule applies only to the corrected fact: do not force the whole example to no_change when it also contains independent reusable presentation changes. A fact removed from one field but retained unchanged in another may demonstrate a reusable field-placement preference. Learn only the presentation dimension directly demonstrated. Never broaden beyond the exact presentation dimension demonstrated; for example, removing size from titles does not imply removing other label details. Never apply a preference to a field whose presentation did not independently demonstrate it; if only description style changed while the title only received a factual correction, do not create title guidance. If all title differences are factual corrections, aiInstructions must not mention title guidance. Do not restate defaults or add guidance for unaffected fields. A complete final account instruction means: preserve currentInstructions and add or refine only preferences supported by the examples; when currentInstructions is null, include only supported new preferences. Different item types may be present; judge whether tone, structure, wording, verbosity, formatting, or field placement would reliably benefit future listings. Never turn item-specific facts or one-off wording into global instructions. Preserve photo-grounded factual safeguards. Return no_change unless a future listing would reliably benefit. aiInstructions must be at most 1000 characters.',
      },
      {
        role: "user",
        content: JSON.stringify({ currentInstructions, examples }),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content || "";
  let result: { action?: string; aiInstructions?: unknown; reason?: unknown };
  try {
    result = JSON.parse(content);
  } catch {
    return null;
  }
  if (result.action === "no_change") return null;
  const validation = validateAiInstructions(result.aiInstructions);
  if (
    !validation.ok ||
    !validation.text ||
    validation.text === currentInstructions
  ) {
    return null;
  }
  return {
    aiInstructions: validation.text,
    reason: String(result.reason || "Suggested from edited generated listings.")
      .trim()
      .slice(0, 240),
  };
}
