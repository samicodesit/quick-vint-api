import { describe, expect, it } from "vitest";
import { extractOpenAIRateLimitHeaders } from "../../../utils/openaiRateLimitHeaders";

describe("extractOpenAIRateLimitHeaders", () => {
  it("reads OpenAI response headers from a Headers-like object", () => {
    expect(
      extractOpenAIRateLimitHeaders(
        new Headers({
          "x-ratelimit-limit-tokens": "2000000",
          "x-ratelimit-remaining-tokens": "1994528",
          "x-ratelimit-reset-tokens": "164ms",
        }),
      ),
    ).toMatchObject({
      limitTokens: "2000000",
      remainingTokens: "1994528",
      resetTokens: "164ms",
    });
  });

  it("reads OpenAI error headers when they are a plain object", () => {
    expect(
      extractOpenAIRateLimitHeaders({
        "x-ratelimit-limit-requests": "5000",
        "x-ratelimit-remaining-requests": "4999",
        "x-ratelimit-reset-requests": "12ms",
      }),
    ).toMatchObject({
      limitRequests: "5000",
      remainingRequests: "4999",
      resetRequests: "12ms",
    });
  });
});
