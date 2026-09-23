import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMobileJsonMock = vi.fn();

vi.mock("../api", () => ({ fetchMobileJson: fetchMobileJsonMock }));

const input = {
  imageUrls: ["signed-0", "signed-1"],
  titleLanguageCode: "fr",
  descriptionLanguageCode: "it",
  descriptionLength: "short" as const,
  useBulletPoints: false,
};

describe("mobile web generation client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMobileJsonMock.mockResolvedValue({
      title: "Robe bleue",
      description: "Robe élégante en très bon état.",
      measurementAdvice: { enabled: false },
      offers: [],
    });
  });

  it("sends independent languages and parses title and description from one response", async () => {
    const { generateListing } = await import("../generationClient.js");
    const result = await generateListing(input);
    expect(fetchMobileJsonMock).toHaveBeenCalledTimes(1);
    const [path, init, options] = fetchMobileJsonMock.mock.calls[0];
    expect(path).toBe("/api/generate");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Autolister-Client": "mobile_web",
      "X-Autolister-Request-Id": expect.any(String),
    });
    expect(JSON.parse(init.body)).toMatchObject({
      imageUrls: input.imageUrls,
      titleLanguageCode: "fr",
      descriptionLanguageCode: "it",
      descriptionLength: "short",
      useBulletPoints: false,
      generationMode: "manual",
    });
    expect(options).toEqual({ retryOn401: true });
    expect(result).toEqual({
      title: "Robe bleue",
      description: "Robe élégante en très bon état.",
      measurementAdvice: { enabled: false },
      offers: [],
    });
  });

  it("keeps the same request ID for a caller retry after an unknown write response", async () => {
    const { generateListing } = await import("../generationClient.js");
    fetchMobileJsonMock.mockRejectedValue({
      status: 504,
      code: "timeout",
      message: "Generation timed out.",
      retryable: true,
    });
    await expect(
      generateListing({ ...input, requestId: "stable-request-id" }),
    ).rejects.toMatchObject({ status: 504, retryable: true });
    await expect(
      generateListing({ ...input, requestId: "stable-request-id" }),
    ).rejects.toMatchObject({ status: 504, retryable: true });
    const requestIds = fetchMobileJsonMock.mock.calls.map(
      ([, init]) => init.headers["X-Autolister-Request-Id"],
    );
    expect(requestIds).toEqual(["stable-request-id", "stable-request-id"]);
  });

  it.each([
    [403, "limit_reached"],
    [429, "service_unavailable"],
    [400, "invalid_generation_input"],
    [413, "payload_too_large"],
    [415, "unsupported_media_type"],
  ])(
    "preserves typed server status %s without hiding it",
    async (status, code) => {
      const { generateListing } = await import("../generationClient.js");
      fetchMobileJsonMock.mockRejectedValue({
        status,
        code,
        message: "Server message",
        retryable: status === 429,
      });
      await expect(generateListing(input)).rejects.toMatchObject({
        status,
        code,
        message: "Server message",
      });
    },
  );

  it("loads usage through the authenticated API projection", async () => {
    const usage = {
      plan: { tier: "free", status: "active", isPaid: false },
      limits: { freeLifetime: 5 },
      remaining: { freeLifetime: 4 },
      canGenerate: true,
    };
    fetchMobileJsonMock.mockResolvedValue(usage);
    const { loadUsage } = await import("../generationClient.js");
    await expect(loadUsage()).resolves.toEqual(usage);
    expect(fetchMobileJsonMock).toHaveBeenCalledWith(
      "/api/user/usage",
      { method: "GET" },
      { retryOn401: true },
    );
  });

  it("uses an RFC 4122 v4 request ID when randomUUID is unavailable", async () => {
    const { generateListing } = await import("../generationClient.js");
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0);
        bytes[6] = 0x40;
        bytes[8] = 0x80;
        return bytes;
      },
    });

    try {
      await generateListing(input);
      const requestId =
        fetchMobileJsonMock.mock.calls[0][1].headers["X-Autolister-Request-Id"];
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates a request ID that the app can retain across retries", async () => {
    const { createMobileGenerationRequestId } =
      await import("../generationClient.js");
    expect(createMobileGenerationRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
