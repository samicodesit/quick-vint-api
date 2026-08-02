import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletion } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
}));

vi.mock("openai", () => ({
  OpenAI: class {
    chat = { completions: { create: createCompletion } };
  },
}));

import { suggestAiStyle } from "../../../utils/aiStyleLearner";

describe("suggestAiStyle prompt", () => {
  beforeEach(() => {
    createCompletion.mockReset();
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "no_change",
              aiInstructions: null,
              reason: "Correction only",
            }),
          },
        },
      ],
    });
  });

  it("ignores factual corrections without suppressing independent style edits", async () => {
    await suggestAiStyle({
      currentInstructions: null,
      examples: [
        {
          generatedTitle: "Black jacket size L",
          generatedDescription: "Black jacket in size L.",
          finalTitle: "Black jacket",
          finalDescription: "Short black jacket in size M.",
        },
      ],
    });

    const systemPrompt = createCompletion.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain(
      "Ignore a factual substitution as preference evidence",
    );
    expect(systemPrompt).toContain(
      "do not force the whole example to no_change",
    );
    expect(systemPrompt).toContain(
      "removed from one field but retained unchanged in another",
    );
    expect(systemPrompt).toContain(
      "Never broaden beyond the exact presentation dimension demonstrated",
    );
    expect(systemPrompt).toContain(
      "Never apply a preference to a field whose presentation did not independently demonstrate it",
    );
    expect(systemPrompt).toContain(
      "if only description style changed while the title only received a factual correction, do not create title guidance",
    );
    expect(systemPrompt).toContain(
      "tone, structure, wording, verbosity, formatting, or field placement",
    );
  });
});
