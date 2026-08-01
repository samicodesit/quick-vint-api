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
          'You learn durable seller writing preferences from listing edits. Return JSON only: {"action":"no_change|append|refine|replace","aiInstructions":string|null,"reason":string}. Be conservative: never turn item-specific corrections (brand, category, size, material, condition, or one-off wording) into a global instruction. Different item types may be present; only learn presentation preferences that are clearly reusable across the supplied examples. Preserve photo-grounded factual safeguards. Return no_change unless a future listing would reliably benefit. aiInstructions must be a complete final account instruction, at most 1000 characters.',
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
