import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtpMock = vi.fn();
const logRequestMock = vi.fn();

vi.mock("cors", () => ({
  default: vi.fn(
    () => (_req: unknown, _res: unknown, callback: (err?: unknown) => void) =>
      callback(),
  ),
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: vi.fn(() => ({
      ipAddress: "203.0.113.10",
      requestMethod: "POST",
      origin: "chrome-extension://test-extension",
    })),
    logRequest: logRequestMock,
  },
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithOtp: signInWithOtpMock,
    },
  },
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));

vi.mock("../../../utils/authAbuseGuard", () => ({
  checkMagicLinkRateLimit: vi.fn(async () => ({ limited: false })),
  getAuthEmailBlockReason: vi.fn(() => null),
  getEmailDomain: vi.fn((email: string) => email.split("@")[1] || null),
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return res;
}

describe("magic link endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_CALLBACK_URL = "";
    process.env.VERCEL_APP_SITE_URL = "chrome-extension://legacy-extension";
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
  });

  it("uses the HTTPS auth callback bridge instead of direct chrome-extension redirects", async () => {
    const handlerModule = await import("../../../api/auth/magic-link.js");
    const handler = handlerModule.default as unknown as (
      req: unknown,
      res: unknown,
    ) => Promise<unknown>;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { origin: "chrome-extension://test-extension" },
        body: { email: "seller@example.com" },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "seller@example.com",
      options: {
        emailRedirectTo: "https://autolister.app/auth/callback",
      },
    });
    expect(logRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/auth/magic-link",
        responseStatus: 200,
      }),
    );
  });
});
