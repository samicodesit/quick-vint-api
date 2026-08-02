import { beforeEach, describe, expect, it, vi } from "vitest";

const createCompletion = vi.fn();
const getUser = vi.fn();
const profileSingle = vi.fn();
const logRequest = vi.fn();
const reserveGenerationRequest = vi.fn();
const commitGenerationReservation = vi.fn();
const refundGenerationReservation = vi.fn();
const detectAndPauseDuplicateIpAccount = vi.fn();

vi.mock("openai", () => ({
  OpenAI: vi.fn(function OpenAI() {
    return {
      chat: {
        completions: {
          create: createCompletion,
        },
      },
    };
  }),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: profileSingle,
        })),
      })),
    })),
  },
}));

vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: {
    reserveGenerationRequest,
    reserveEmojiRetry: reserveGenerationRequest,
    commitGenerationReservation,
    refundGenerationReservation,
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: vi.fn(() => ({
      origin: "https://www.vinted.sk",
      ipAddress: "203.0.113.10",
      userAgent: "vitest",
    })),
    detectSuspiciousActivity: vi.fn(() => ({
      suspicious: false,
      reasons: [],
    })),
    logRequest,
  },
}));

vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount,
}));

vi.mock("../../../utils/generationOffers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../utils/generationOffers")
  >("../../../utils/generationOffers");
  return {
    ...actual,
    maybeCreateGenerationOffer: vi.fn(async () => []),
  };
});

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, unknown>,
    setHeader: vi.fn((name: string, value: unknown) => {
      response.headers[name] = value;
      return response;
    }),
    getHeader: vi.fn((name: string) => response.headers[name]),
    end: vi.fn(() => response),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: any) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

describe("/api/generate remote image handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_APP_SUPABASE_URL = "https://project.supabase.co";

    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "seller@example.com",
        },
      },
      error: null,
    });
    profileSingle.mockResolvedValue({
      data: {
        api_calls_this_month: 0,
        subscription_status: "active",
        subscription_tier: "pro",
        last_api_call_reset: "2026-07-17",
        is_legacy_plan: false,
        free_lifetime_generations_used: 0,
        pack_credits: 0,
        account_status: "active",
        abuse_reason: null,
      },
      error: null,
    });
    reserveGenerationRequest.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
    });
    detectAndPauseDuplicateIpAccount.mockResolvedValue({ paused: false });
    createCompletion.mockReturnValue({
      withResponse: vi.fn(async () => ({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Black Dress",
                  description: "Black dress.",
                }),
              },
            },
          ],
          usage: { total_tokens: 10, prompt_tokens: 8, completion_tokens: 2 },
        },
        response: new Response(null, { headers: {} }),
      })),
    });
  });

  it("rejects missing auth before reserving generation or calling OpenAI", async () => {
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          "x-autolister-extension-version": "1.3.54",
        },
        body: {
          imageUrls: ["data:image/jpeg;base64,abc"],
          languageCode: "en",
          titleLanguageCode: "en",
          descriptionLanguageCode: "en",
          tone: "standard",
          useEmojis: false,
          useHashtags: true,
          useBulletPoints: true,
          descriptionLength: "short",
          generationMode: "manual",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing or invalid Authorization" });
    expect(getUser).not.toHaveBeenCalled();
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
    expect(createCompletion).not.toHaveBeenCalled();
    expect(logRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 401,
        flaggedReason: "Auth header missing or malformed",
      }),
    );
  });

  it("returns rate-limit denial without calling OpenAI", async () => {
    reserveGenerationRequest.mockResolvedValue({
      allowed: false,
      error: "Daily limit reached.",
      code: "daily_limit_reached",
      currentTier: "free",
      nextTier: "starter",
      limitScope: "daily",
      currentLimit: 5,
      remainingRequests: 0,
    });
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "x-autolister-extension-version": "1.3.54",
        },
        body: {
          imageUrls: ["data:image/jpeg;base64,abc"],
          languageCode: "en",
          titleLanguageCode: "en",
          descriptionLanguageCode: "en",
          tone: "standard",
          useEmojis: false,
          useHashtags: true,
          useBulletPoints: true,
          descriptionLength: "short",
          generationMode: "manual",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      error: "Daily limit reached.",
      code: "daily_limit_reached",
      currentTier: "free",
      nextTier: "starter",
      limitScope: "daily",
      currentLimit: 5,
      remainingRequests: 0,
    });
    expect(createCompletion).not.toHaveBeenCalled();
    expect(commitGenerationReservation).not.toHaveBeenCalled();
    expect(refundGenerationReservation).not.toHaveBeenCalled();
    expect(logRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 429,
        flaggedReason: "Rate limit exceeded",
      }),
    );
  });

  it("allows scoped knowledge enrichment without account instructions", async () => {
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "x-autolister-extension-version": "1.3.54",
        },
        body: {
          imageUrls: ["data:image/jpeg;base64,abc"],
          languageCode: "en",
          titleLanguageCode: "en",
          descriptionLanguageCode: "en",
          tone: "standard",
          useEmojis: false,
          useHashtags: true,
          useBulletPoints: true,
          descriptionLength: "short",
          generationMode: "manual",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    const completionParams = createCompletion.mock.calls[0][0];
    const systemPrompt = completionParams.messages[0].content;
    const userPrompt = completionParams.messages[1].content[0].text;

    expect(systemPrompt).toBe(
      "You are an expert Vinted listing writer creating accurate, searchable drafts from photos. Hard rule: never guess. Follow the factual safeguards and knowledge-enrichment scope in the user prompt. Write plain seller-style copy without marketing claims, styling advice, subjective praise, or assumptions.",
    );
    expect(userPrompt).not.toContain("Account-specific behavior:");
    expect(userPrompt).toContain(`Knowledge-based enrichment:
- For confidently recognized books, games, media, electronics, toys, collectibles, appliances, and similar non-fashion products, add substantive, stable, buyer-relevant facts about the specific item from existing knowledge even when not visible in the photos. Generic labels or reputation alone do not count as enrichment.
- Identify from the full image. Never state facts more specific than the identity supported by the photos; omit them when recognition or knowledge is uncertain.
- Avoid padding, trivia, repetition, and promotional claims. Exclude ordinary apparel, footwear, bags, jewelry, and fashion accessories.`);
    expect(userPrompt).toContain(
      'This controls how much useful detail each sentence or bullet contains, not just the number of bullets.\nReply only in JSON: {"title":"...","description":"..."}',
    );
  });

  it("lets account instructions override defaults without overriding request settings", async () => {
    profileSingle.mockResolvedValueOnce({
      data: {
        api_calls_this_month: 0,
        subscription_status: "active",
        subscription_tier: "pro",
        last_api_call_reset: "2026-07-17",
        is_legacy_plan: false,
        free_lifetime_generations_used: 0,
        pack_credits: 0,
        account_status: "active",
        abuse_reason: null,
        ai_instructions:
          "Use persuasive sales copy, subjective praise, urgency, and an audience-focused voice.",
      },
      error: null,
    });
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "x-autolister-extension-version": "1.3.54",
        },
        body: {
          imageUrls: ["data:image/jpeg;base64,abc"],
          languageCode: "en",
          titleLanguageCode: "en",
          descriptionLanguageCode: "en",
          tone: "friendly",
          useEmojis: true,
          useHashtags: true,
          useBulletPoints: true,
          descriptionLength: "long",
          generationMode: "manual",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    const completionParams = createCompletion.mock.calls[0][0];
    const systemPrompt = completionParams.messages[0].content;
    const userPrompt = completionParams.messages[1].content[0].text;

    expect(systemPrompt).toContain(
      "Account-specific instructions may override the default standard tone and general style",
    );
    expect(systemPrompt).toContain(
      "marketing language, subjective praise, calls to action, audience framing",
    );
    expect(systemPrompt).toContain(
      "Concrete request settings take priority over account-specific instructions: emoji use, hashtags, bullet or paragraph format, description length, and any selected non-standard tone.",
    );
    expect(systemPrompt).toContain(
      "They never override photo-grounded objective facts, the ban on invented product details, requested languages, saved-note behavior, or the JSON output contract.",
    );
    expect(systemPrompt).toContain(
      "Follow the factual safeguards and knowledge-enrichment scope in the user prompt; never invent",
    );
    expect(userPrompt).toContain(
      "Build the listing only from visible or readable photo evidence.",
    );
    expect(userPrompt).toContain(
      "Do not mention defects or negative condition details for now",
    );
    expect(userPrompt).toContain("Reply only in JSON");
    expect(userPrompt).toContain("Account-specific behavior:");
    expect(userPrompt).toContain(
      "Use persuasive sales copy, subjective praise, urgency, and an audience-focused voice.",
    );
    expect(userPrompt).toContain(
      "respecting the safeguards and concrete request-setting precedence above.",
    );
    expect(logRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        fullRequestBody: expect.objectContaining({
          hasCustomAiInstructions: true,
          customAiInstructionsLength: 85,
        }),
      }),
    );
  });

  it("converts remote signed image URLs before sending images to OpenAI", async () => {
    const remoteImageUrl =
      "https://project.supabase.co/storage/v1/object/sign/temp-uploads/sess_1/000000-upload.jpg?token=abc";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(Buffer.from("jpeg-bytes"), {
        headers: { "content-type": "image/jpeg" },
      });
    }) as typeof fetch;

    try {
      const module = await import("../../../api/generate.js");
      const handler = (module as any).default;
      const res = createResponse();

      await handler(
        {
          method: "POST",
          headers: {
            authorization: "Bearer token",
            "x-autolister-extension-version": "1.3.54",
          },
          body: {
            imageUrls: [remoteImageUrl],
            languageCode: "en",
            titleLanguageCode: "en",
            descriptionLanguageCode: "en",
            tone: "standard",
            useEmojis: false,
            useHashtags: true,
            useBulletPoints: true,
            descriptionLength: "short",
            generationMode: "manual",
          },
        } as any,
        res as any,
      );

      expect(res.statusCode).toBe(200);
      const completionParams = createCompletion.mock.calls[0][0];
      const promptPart = completionParams.messages[1].content[0];
      expect(promptPart.text).toContain(
        "Never write instructions, questions, placeholders, or notes to the seller inside the title or description.",
      );
      expect(promptPart.text).not.toContain(
        "prefer the readable EU/EUR size over US, UK",
      );
      expect(promptPart.text).toContain(
        'Include the visible EU/EUR size when present, for example "EU 42 / UK 14"',
      );
      expect(promptPart.text).toContain(
        "For item type, choose the most specific accurate name clearly supported by the photos or readable text",
      );
      expect(promptPart.text).toContain(
        "If the exact subtype is ambiguous, use a broader safe item type instead of guessing",
      );
      const imagePart = completionParams.messages[1].content[1];
      expect(imagePart.image_url.url).toBe(
        `data:image/jpeg;base64,${Buffer.from("jpeg-bytes").toString("base64")}`,
      );
      expect(logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrls: [remoteImageUrl],
          responseStatus: 200,
          fullRequestBody: expect.objectContaining({
            openaiImageUrlKinds: ["data_url"],
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refunds the generation reservation and returns a simple message when OpenAI rejects images", async () => {
    const remoteImageUrl =
      "https://project.supabase.co/storage/v1/object/sign/temp-uploads/sess_1/000000-upload.jpg?token=abc";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(Buffer.from("jpeg-bytes"), {
        headers: { "content-type": "image/jpeg" },
      });
    }) as typeof fetch;
    createCompletion.mockReturnValue({
      withResponse: vi.fn(async () => {
        const error = new Error(
          "Invalid image URL. Expected a base64-encoded data URL.",
        ) as Error & { status?: number };
        error.status = 400;
        throw error;
      }),
    });

    try {
      const module = await import("../../../api/generate.js");
      const handler = (module as any).default;
      const res = createResponse();

      await handler(
        {
          method: "POST",
          headers: {
            authorization: "Bearer token",
            "x-autolister-extension-version": "1.3.54",
          },
          body: {
            imageUrls: [remoteImageUrl],
            languageCode: "en",
            titleLanguageCode: "en",
            descriptionLanguageCode: "en",
            tone: "standard",
            useEmojis: false,
            useHashtags: true,
            useBulletPoints: true,
            descriptionLength: "short",
            generationMode: "manual",
          },
        } as any,
        res as any,
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error:
          "There was an issue processing your images. Please try different images.",
      });
      expect(res.body.error).not.toContain("OpenAI");
      expect(res.body.error).not.toContain("base64");
      expect(refundGenerationReservation).toHaveBeenCalledWith(
        "reservation-1",
        "invalid_generation_input",
      );
      expect(commitGenerationReservation).not.toHaveBeenCalled();
      expect(logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrls: [remoteImageUrl],
          responseStatus: 400,
          flaggedReason:
            "OpenAI generation error: Invalid image URL. Expected a base64-encoded data URL.",
          fullRequestBody: expect.objectContaining({
            openaiImageUrlKinds: ["data_url"],
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
