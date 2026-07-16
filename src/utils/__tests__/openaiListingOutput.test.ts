import { describe, expect, it } from "vitest";
import { parseOpenAIListingOutput } from "../../../utils/openaiListingOutput";

describe("parseOpenAIListingOutput", () => {
  it("returns trimmed title and description", () => {
    expect(
      parseOpenAIListingOutput(
        JSON.stringify({
          title: "  White cotton shirt  ",
          description: "  Plain white shirt with buttons.  ",
        }),
      ),
    ).toEqual({
      title: "White cotton shirt",
      description: "Plain white shirt with buttons.",
    });
  });

  it("rejects empty listing fields instead of returning fallback copy", () => {
    expect(() =>
      parseOpenAIListingOutput(
        JSON.stringify({
          title: " ",
          description: "No description available.",
        }),
      ),
    ).toThrow("OpenAI returned empty listing fields");
  });

  it("rejects placeholder listing fields", () => {
    expect(() =>
      parseOpenAIListingOutput(
        JSON.stringify({
          title: "Untitled",
          description: "No description available.",
        }),
      ),
    ).toThrow("OpenAI returned placeholder listing fields");
  });
});
