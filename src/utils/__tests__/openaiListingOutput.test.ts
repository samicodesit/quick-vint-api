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

  it("returns a clear no-item result for empty listing fields", () => {
    expect(
      parseOpenAIListingOutput(
        JSON.stringify({
          title: " ",
          description: "No description available.",
        }),
      ),
    ).toEqual({
      title: "Item not visible",
      description:
        "I can't identify a clear item from this photo. Please try another photo where the item is visible.",
    });
  });

  it("replaces placeholder listing fields", () => {
    expect(
      parseOpenAIListingOutput(
        JSON.stringify({
          title: "Untitled",
          description: "No description available.",
        }),
      ),
    ).toEqual({
      title: "Item not visible",
      description:
        "I can't identify a clear item from this photo. Please try another photo where the item is visible.",
    });
  });
});
