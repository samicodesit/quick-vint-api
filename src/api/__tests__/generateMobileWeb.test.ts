import { beforeEach, describe, expect, it, vi } from "vitest";

const createCompletion = vi.fn();
const getUser = vi.fn();
const profileSingle = vi.fn();
const logRequest = vi.fn();
const backgroundWork = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("@vercel/functions", () => ({
  waitUntil: (work: Promise<unknown>) => backgroundWork.push(work),
}));
const reserveGenerationRequest = vi.fn();
const reserveEmojiRetry = vi.fn();
const commitGenerationReservation = vi.fn();
const commitGenerationReservationVerified = vi.fn();
const refundGenerationReservation = vi.fn();
const detectAndPauseDuplicateIpAccount = vi.fn();
const claimMobileGenerationIdempotency = vi.fn();
const reserveAndBindMobileGenerationReservation = vi.fn();
const bindMobileGenerationReservation = vi.fn();
const completeMobileGenerationIdempotency = vi.fn();
const failMobileGenerationIdempotency = vi.fn();
const markMobileGenerationCommitPending = vi.fn();
const {
  prepareDraftGeneration,
  bindDraftGeneration,
  storeDraftGeneration,
  completeDraftGeneration,
} = vi.hoisted(() => ({
  prepareDraftGeneration: vi.fn(),
  bindDraftGeneration: vi.fn(),
  storeDraftGeneration: vi.fn(),
  completeDraftGeneration: vi.fn(),
}));
vi.mock("../../../utils/draftGeneration", () => ({
  prepareDraftGeneration,
  bindDraftGeneration,
  storeDraftGeneration,
  completeDraftGeneration,
}));

vi.mock("openai", () => ({
  OpenAI: vi.fn(function OpenAI() {
    return {
      chat: { completions: { create: createCompletion } },
    };
  }),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: profileSingle })),
      })),
    })),
  },
}));

vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: {
    reserveGenerationRequest,
    reserveEmojiRetry,
    commitGenerationReservation,
    commitGenerationReservationVerified,
    refundGenerationReservation,
  },
  getGenerationReservationParams: vi.fn(() => ({
    pricingLimitsMode: "current",
    effectiveTier: "pro",
    monthlyLimit: 500,
    dailyLimit: 50,
    burstLimit: 20,
    freeLifetimeLimit: 5,
    hasUnlimitedDaily: false,
  })),
}));

vi.mock("../../../utils/mobileGenerationIdempotency", () => ({
  claimMobileGenerationIdempotency,
  reserveAndBindMobileGenerationReservation,
  bindMobileGenerationReservation,
  completeMobileGenerationIdempotency,
  failMobileGenerationIdempotency,
  markMobileGenerationCommitPending,
  normalizeMobileGenerationRequest: vi.fn(() => ({
    hash: "a".repeat(64),
    imageCount: 1,
  })),
  sanitizeStoredFailureBody: vi.fn((body: Record<string, unknown>) => body),
  validateStoredResponse: vi.fn((response: Record<string, unknown>) => ({
    ok: true,
    response,
    serialized: JSON.stringify(response),
    bytes: Buffer.byteLength(JSON.stringify(response), "utf8"),
  })),
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: vi.fn(() => ({
      origin: undefined,
      ipAddress: "203.0.113.10",
      userAgent: "vitest",
    })),
    detectSuspiciousActivity: vi.fn(() => ({ suspicious: false, reasons: [] })),
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
      response.headers[name.toLowerCase()] = value;
      return response;
    }),
    getHeader: vi.fn((name: string) => response.headers[name.toLowerCase()]),
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

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const mobileHeaders = {
  authorization: "Bearer token",
  "x-autolister-client": "mobile_web",
  "x-autolister-request-id": requestId,
};
const body = {
  imageUrls: ["data:image/jpeg;base64,abc"],
  titleLanguageCode: "en",
  descriptionLanguageCode: "en",
  tone: "standard",
  useEmojis: false,
  useHashtags: true,
  useBulletPoints: false,
  descriptionLength: "short",
  generationMode: "manual",
};

describe("mobile web generation idempotency", () => {
  it("refunds instead of committing when the draft is deleted while the provider runs", async () => {
    prepareDraftGeneration.mockResolvedValue({
      body,
      context: {
        userId: "user-1",
        draftId: requestId,
        operationId: requestId,
        hash: "b".repeat(64),
      },
    });
    storeDraftGeneration.mockRejectedValue(
      Object.assign(new Error("Deleted"), {
        status: 404,
        code: "draft_not_found",
      }),
    );
    const module = await import("../../../api/generate.js");
    const res = createResponse();
    await (module as any).default(
      {
        method: "POST",
        headers: mobileHeaders,
        body: { draftId: requestId, inputVersion: 1 },
      },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(refundGenerationReservation).toHaveBeenCalled();
    expect(commitGenerationReservationVerified).not.toHaveBeenCalled();
  });
  it("saves draft output before committing usage and before reporting success", async () => {
    const context = {
      userId: "user-1",
      draftId: requestId,
      operationId: requestId,
      hash: "b".repeat(64),
    };
    prepareDraftGeneration.mockResolvedValue({ body, context });
    completeDraftGeneration.mockResolvedValue({ ok: true });
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const res = createResponse();
    await handler(
      {
        method: "POST",
        headers: mobileHeaders,
        body: { draftId: requestId, inputVersion: 1 },
      } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect(bindDraftGeneration).toHaveBeenCalled();
    expect(storeDraftGeneration).toHaveBeenCalled();
    expect(completeDraftGeneration).toHaveBeenCalled();
    expect(storeDraftGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      commitGenerationReservationVerified.mock.invocationCallOrder[0],
    );
    expect(completeMobileGenerationIdempotency).not.toHaveBeenCalled();
  });
  it("returns a recovered draft without reserving usage or calling the provider", async () => {
    prepareDraftGeneration.mockResolvedValue({
      response: { title: "Recovered", description: "Saved result" },
    });
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const res = createResponse();
    await handler(
      {
        method: "POST",
        headers: mobileHeaders,
        body: { draftId: requestId, inputVersion: 1 },
      } as any,
      res as any,
    );
    expect(res.body.title).toBe("Recovered");
    expect(createCompletion).not.toHaveBeenCalled();
    expect(reserveAndBindMobileGenerationReservation).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.VERCEL_APP_OPENAI_API_KEY = "test-openai-key";
    process.env.VERCEL_APP_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.MOBILE_WEB_APP_ENABLED = "true";

    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "seller@example.com" } },
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
        ai_instructions: null,
      },
      error: null,
    });
    detectAndPauseDuplicateIpAccount.mockResolvedValue({ paused: false });
    reserveGenerationRequest.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
    });
    reserveEmojiRetry.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
    });
    commitGenerationReservation.mockResolvedValue(undefined);
    commitGenerationReservationVerified.mockResolvedValue({ ok: true });
    refundGenerationReservation.mockResolvedValue(undefined);
    claimMobileGenerationIdempotency.mockResolvedValue({
      kind: "new",
      recordId: "record-1",
      attemptId: "attempt-1",
    });
    reserveAndBindMobileGenerationReservation.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
    });
    completeMobileGenerationIdempotency.mockResolvedValue({ ok: true });
    failMobileGenerationIdempotency.mockResolvedValue({ ok: true });
    markMobileGenerationCommitPending.mockResolvedValue({ ok: true });
    bindMobileGenerationReservation.mockResolvedValue({ ok: true });
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
        response: { headers: {} },
      })),
    });
  });

  async function invoke(
    headers: Record<string, string> = mobileHeaders,
    requestBody = body,
  ) {
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const response = createResponse();
    await handler(
      { method: "POST", headers, body: requestBody } as any,
      response as any,
    );
    return response;
  }

  async function invokeWithoutBody(
    headers: Record<string, string> = mobileHeaders,
  ) {
    const module = await import("../../../api/generate.js");
    const handler = (module as any).default;
    const response = createResponse();
    await handler({ method: "POST", headers } as any, response as any);
    return response;
  }

  const extensionHeaders = {
    authorization: "Bearer token",
    "x-autolister-client": "extension",
    "x-autolister-extension-version": "1.3.17",
    "x-autolister-request-id": requestId,
  };

  it("returns a committed mobile result while a slow reporting write finishes in the background", async () => {
    let finishLog!: () => void;
    logRequest.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishLog = resolve;
        }),
    );
    const pending = invoke();
    try {
      const response = await Promise.race([
        pending,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
      ]);
      expect(response?.statusCode).toBe(200);
      expect(response?.body.title).toBe("Black Dress");
      expect(completeMobileGenerationIdempotency).toHaveBeenCalled();
      expect(backgroundWork.length).toBeGreaterThan(0);
    } finally {
      finishLog?.();
      await pending;
    }
  });

  it("replays an extension result with mobile disabled without another AI call or credit", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";
    claimMobileGenerationIdempotency.mockResolvedValue({
      kind: "succeeded",
      statusCode: 200,
      response: { title: "Recovered", description: "Saved extension result" },
    });
    const res = await invoke(extensionHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe("Recovered");
    expect(claimMobileGenerationIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ client: "extension", requestId }),
    );
    expect(createCompletion).not.toHaveBeenCalled();
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
    expect(reserveAndBindMobileGenerationReservation).not.toHaveBeenCalled();
  });

  it("uses the shared atomic reservation and durable result for new extension requests", async () => {
    const res = await invoke(extensionHeaders);
    expect(res.statusCode).toBe(200);
    expect(reserveAndBindMobileGenerationReservation).toHaveBeenCalledWith(
      expect.objectContaining({ client: "extension", requestId }),
    );
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
    expect(markMobileGenerationCommitPending).toHaveBeenCalled();
    expect(commitGenerationReservationVerified).toHaveBeenCalled();
    expect(completeMobileGenerationIdempotency).toHaveBeenCalled();
  });

  it("rejects malformed extension operation IDs before spending capacity", async () => {
    const res = await invoke({
      ...extensionHeaders,
      "x-autolister-request-id": "bad",
    });
    expect(res.statusCode).toBe(400);
    expect(createCompletion).not.toHaveBeenCalled();
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
  });

  it("preserves the extension's special free emoji retry entitlement", async () => {
    profileSingle.mockResolvedValue({
      data: {
        subscription_tier: "free",
        subscription_status: "free",
        last_api_call_reset: "2026-10-11",
      },
      error: null,
    });
    reserveEmojiRetry.mockResolvedValue({
      allowed: true,
      reservationId: "emoji-reservation",
    });
    const res = await invoke(extensionHeaders, {
      ...body,
      emojiRetry: true,
    } as typeof body);
    expect(res.statusCode).toBe(200);
    expect(reserveEmojiRetry).toHaveBeenCalled();
    expect(reserveAndBindMobileGenerationReservation).not.toHaveBeenCalled();
    expect(bindMobileGenerationReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "emoji-reservation" }),
    );
  });

  it("refunds a special emoji reservation when binding fails and never calls AI", async () => {
    profileSingle.mockResolvedValue({
      data: {
        subscription_tier: "free",
        subscription_status: "free",
        last_api_call_reset: "2026-10-11",
      },
      error: null,
    });
    reserveEmojiRetry.mockResolvedValue({
      allowed: true,
      reservationId: "emoji-reservation",
    });
    bindMobileGenerationReservation.mockResolvedValue({
      ok: false,
      code: "transition_rejected",
    });
    const res = await invoke(extensionHeaders, {
      ...body,
      emojiRetry: true,
    } as typeof body);
    expect(res.statusCode).toBe(503);
    expect(refundGenerationReservation).toHaveBeenCalledWith(
      "emoji-reservation",
      "idempotency_bind_failed",
    );
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("does not refund an extension result after its usage commit becomes uncertain", async () => {
    commitGenerationReservationVerified.mockRejectedValue(
      new Error("Lost commit response"),
    );
    const res = await invoke(extensionHeaders);
    expect(res.statusCode).toBe(500);
    expect(markMobileGenerationCommitPending).toHaveBeenCalled();
    expect(refundGenerationReservation).not.toHaveBeenCalled();
  });

  it("claim_is_atomic_and_replays_bounded_failure", async () => {
    createCompletion.mockReturnValue({
      withResponse: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    claimMobileGenerationIdempotency
      .mockResolvedValueOnce({ kind: "new", recordId: "record-1" })
      .mockResolvedValueOnce({
        kind: "failed",
        statusCode: 504,
        body: { error: "The request took too long. Please try again." },
        retryable: true,
      })
      .mockResolvedValueOnce({ kind: "new", recordId: "record-2" });

    const first = await invoke();
    const second = await invoke();
    const third = await invoke();

    expect(first.statusCode).toBe(504);
    expect(second.statusCode).toBe(504);
    expect(second.body).toEqual(first.body);
    expect(reserveAndBindMobileGenerationReservation).toHaveBeenCalledTimes(2);
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
    expect(third.statusCode).toBe(504);
  });

  it("returns the disabled response before authenticating mobile requests", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";

    const response = await invoke();

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Mobile web app unavailable.",
      code: "mobile_web_disabled",
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();
  });

  it("keeps extension generation enabled when the mobile flag is disabled", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";

    const response = await invoke(
      {
        authorization: "Bearer token",
        "x-autolister-extension-version": "1.4.2",
      },
      body,
    );

    expect(response.statusCode).toBe(200);
    expect(getUser).toHaveBeenCalledWith("token");
    expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();
    expect(reserveAndBindMobileGenerationReservation).not.toHaveBeenCalled();
    expect(commitGenerationReservation).toHaveBeenCalledWith("reservation-1");
  });

  it("does not claim before deterministic validation or for extension requests", async () => {
    await invoke(mobileHeaders, { ...body, imageUrls: [] });
    expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();

    const extension = await invoke(
      {
        authorization: "Bearer token",
        "x-autolister-extension-version": "1.4.2",
      },
      body,
    );
    expect(extension.statusCode).toBe(200);
    expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();
    expect(reserveAndBindMobileGenerationReservation).not.toHaveBeenCalled();
    expect(commitGenerationReservation).toHaveBeenCalledWith("reservation-1");
  });

  it("does not persist success when reservation commit is uncertain", async () => {
    commitGenerationReservationVerified.mockResolvedValue({
      state: "pending",
      ok: false,
    });

    const response = await invoke();

    expect(response.statusCode).toBe(503);
    expect(completeMobileGenerationIdempotency).not.toHaveBeenCalled();
    expect(markMobileGenerationCommitPending).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "record-1",
        attemptId: "attempt-1",
        reservationId: "reservation-1",
      }),
    );
  });

  it("atomically reserves and binds before starting model work", async () => {
    const events: string[] = [];
    reserveAndBindMobileGenerationReservation.mockImplementation(
      async (input) => {
        events.push("reserve-and-bind");
        expect(input).toEqual(
          expect.objectContaining({
            userId: "user-1",
            recordId: "record-1",
            attemptId: "attempt-1",
          }),
        );
        return { allowed: true, reservationId: "reservation-1" };
      },
    );
    createCompletion.mockImplementation(() => {
      events.push("model");
      return {
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
          },
          response: { headers: {} },
        })),
      };
    });

    const response = await invoke();

    expect(response.statusCode).toBe(200);
    expect(events[0]).toBe("reserve-and-bind");
    expect(events).toContain("model");
  });

  it("returns a quota denial from the atomic reservation without model work", async () => {
    reserveAndBindMobileGenerationReservation.mockResolvedValue({
      allowed: false,
      code: "daily_limit",
      limitScope: "day",
      currentLimit: 10,
      error: "Daily usage limit reached.",
    });

    const response = await invoke();

    expect(response.statusCode).toBe(429);
    expect(failMobileGenerationIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        failureCode: "daily_limit",
        retryable: false,
      }),
    );
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it.each([
    ["stale attempt", { allowed: false, code: "idempotency_bind_failed" }],
    ["RPC error", { allowed: false, code: "idempotency_bind_failed" }],
  ])(
    "stops model work after an atomic reservation %s",
    async (_name, result) => {
      reserveAndBindMobileGenerationReservation.mockResolvedValue(result);

      const response = await invoke();

      expect(response.statusCode).toBe(503);
      expect(failMobileGenerationIdempotency).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          failureCode: "idempotency_bind_failed",
          retryable: true,
        }),
      );
      expect(refundGenerationReservation).not.toHaveBeenCalled();
      expect(createCompletion).not.toHaveBeenCalled();
    },
  );

  it("resumes a commit-pending response without reserving or calling the model again", async () => {
    claimMobileGenerationIdempotency.mockResolvedValueOnce({
      kind: "commit_pending",
      recordId: "record-1",
      attemptId: "attempt-1",
      reservationId: "reservation-1",
      response: { title: "Saved title", description: "Saved description" },
    });

    const response = await invoke();

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      title: "Saved title",
      description: "Saved description",
    });
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
    expect(createCompletion).not.toHaveBeenCalled();
    expect(commitGenerationReservationVerified).toHaveBeenCalledWith(
      "reservation-1",
    );
    expect(completeMobileGenerationIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "record-1",
        attemptId: "attempt-1",
        reservationId: "reservation-1",
        response: { title: "Saved title", description: "Saved description" },
      }),
    );
  });

  it("persists commit-pending before committing the reservation", async () => {
    const events: string[] = [];
    markMobileGenerationCommitPending.mockImplementation(async (input) => {
      events.push("mark");
      expect(input).toEqual(
        expect.objectContaining({
          recordId: "record-1",
          attemptId: "attempt-1",
          reservationId: "reservation-1",
        }),
      );
      return { ok: true };
    });
    commitGenerationReservationVerified.mockImplementation(async () => {
      events.push("commit");
      return { ok: true };
    });
    completeMobileGenerationIdempotency.mockImplementation(async () => {
      events.push("complete");
      return { ok: true };
    });

    const response = await invoke();

    expect(response.statusCode).toBe(200);
    expect(events).toEqual(["mark", "commit", "complete"]);
  });

  it("does not commit when commit-pending persistence fails", async () => {
    markMobileGenerationCommitPending.mockResolvedValue({
      ok: false,
      code: "rpc_failed",
    });

    const response = await invoke();

    expect(response.statusCode).toBe(503);
    expect(commitGenerationReservationVerified).not.toHaveBeenCalled();
    expect(completeMobileGenerationIdempotency).not.toHaveBeenCalled();
    expect(refundGenerationReservation).toHaveBeenCalledWith(
      "reservation-1",
      "idempotency_precommit_failed",
    );
  });

  it("preserves provider 403 as a bounded non-retryable mobile failure", async () => {
    const providerError = Object.assign(
      new Error("provider forbidden rate limit"),
      {
        status: 403,
      },
    );
    createCompletion.mockReturnValue({
      withResponse: vi.fn().mockRejectedValue(providerError),
    });

    const response = await invoke();

    expect(response.statusCode).toBe(403);
    expect(refundGenerationReservation).toHaveBeenCalledWith(
      "reservation-1",
      "generation_failed",
    );
    expect(failMobileGenerationIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-1",
        statusCode: 403,
        retryable: false,
      }),
    );
  });

  it("sanitizes provider URLs and token-shaped secrets before API logging", async () => {
    createCompletion.mockReturnValue({
      withResponse: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "provider failed at https://provider.example/request?token=secret Bearer abcdefghijklmnop.qrstuvwxyz123456.abcdefghijklmnop JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature token=secret-token-value access_token=oauth-access-value refresh-token:oauth-refresh-value client_secret=client-secret-value api-key=api-key-value",
          ),
        ),
    });

    const response = await invoke();

    expect(response.statusCode).toBe(500);
    const flaggedReason = logRequest.mock.calls.at(-1)?.[0]?.flaggedReason;
    expect(flaggedReason).toContain("[redacted-url]");
    expect(flaggedReason).not.toContain("token=secret");
    expect(flaggedReason).not.toContain("Bearer ");
    expect(flaggedReason).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(flaggedReason).not.toContain("secret-token-value");
    expect(flaggedReason).not.toContain("oauth-access-value");
    expect(flaggedReason).not.toContain("oauth-refresh-value");
    expect(flaggedReason).not.toContain("client-secret-value");
    expect(flaggedReason).not.toContain("api-key-value");
  });

  it("keeps extension provider 403 behavior unchanged", async () => {
    const providerError = Object.assign(new Error("provider forbidden"), {
      status: 403,
    });
    createCompletion.mockReturnValue({
      withResponse: vi.fn().mockRejectedValue(providerError),
    });

    const response = await invoke(
      {
        authorization: "Bearer token",
        "x-autolister-extension-version": "1.4.2",
      },
      body,
    );

    expect(response.statusCode).toBe(500);
    expect(refundGenerationReservation).toHaveBeenCalledWith(
      "reservation-1",
      "generation_failed",
    );
    expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();
  });

  it.each([null, "not-an-object", []])(
    "returns deterministic 400 for an invalid request body (%j) before claiming",
    async (requestBody) => {
      const response = await invoke(mobileHeaders, requestBody as any);

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({
        error: "imageUrls must be a non-empty array of strings.",
      });
      expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();
      expect(reserveGenerationRequest).not.toHaveBeenCalled();
    },
  );

  it("returns deterministic 400 for a missing request body before claiming", async () => {
    const response = await invokeWithoutBody();

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: "imageUrls must be a non-empty array of strings.",
    });
    expect(claimMobileGenerationIdempotency).not.toHaveBeenCalled();
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
  });

  it("does not reserve again while a prior commit-pending attempt is unresolved", async () => {
    commitGenerationReservationVerified.mockResolvedValue({
      state: "committed",
      ok: false,
    });
    claimMobileGenerationIdempotency.mockResolvedValueOnce({
      kind: "new",
      recordId: "record-1",
      attemptId: "attempt-1",
    });
    const first = await invoke();

    claimMobileGenerationIdempotency.mockResolvedValueOnce({
      kind: "in_progress",
      requestId,
      attemptId: "attempt-1",
      commitPending: true,
    });
    const second = await invoke();

    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(409);
    expect(reserveAndBindMobileGenerationReservation).toHaveBeenCalledTimes(1);
    expect(reserveGenerationRequest).not.toHaveBeenCalled();
  });
});
