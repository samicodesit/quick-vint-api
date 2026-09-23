import { beforeEach, describe, expect, it, vi } from "vitest";

const createCompletion = vi.fn();
const getUser = vi.fn();
const profileSingle = vi.fn();
const logRequest = vi.fn();
const reserveGenerationRequest = vi.fn();
const reserveEmojiRetry = vi.fn();
const commitGenerationReservation = vi.fn();
const commitGenerationReservationVerified = vi.fn();
const refundGenerationReservation = vi.fn();
const detectAndPauseDuplicateIpAccount = vi.fn();
const claimMobileGenerationIdempotency = vi.fn();
const completeMobileGenerationIdempotency = vi.fn();
const failMobileGenerationIdempotency = vi.fn();
const markMobileGenerationCommitPending = vi.fn();

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
}));

vi.mock("../../../utils/mobileGenerationIdempotency", () => ({
  claimMobileGenerationIdempotency,
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
    completeMobileGenerationIdempotency.mockResolvedValue({ ok: true });
    failMobileGenerationIdempotency.mockResolvedValue({ ok: true });
    markMobileGenerationCommitPending.mockResolvedValue({ ok: true });
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
    expect(reserveGenerationRequest).toHaveBeenCalledTimes(2);
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
    expect(reserveGenerationRequest).toHaveBeenCalledTimes(1);
  });
});
