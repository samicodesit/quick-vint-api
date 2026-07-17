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
