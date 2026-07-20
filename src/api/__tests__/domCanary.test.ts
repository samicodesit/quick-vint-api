import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const extractRequestMetadataMock = vi.fn();
const logRequestMock = vi.fn();

vi.mock("cors", () => ({
  default: vi.fn(
    () => (_req: unknown, _res: unknown, callback: (err?: unknown) => void) =>
      callback(),
  ),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {
      emails: {
        send: vi.fn(),
      },
    };
  }),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: extractRequestMetadataMock,
    logRequest: logRequestMock,
  },
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as unknown,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
    end: vi.fn(() => response),
  };
  return response;
}

function createRequest(token: string) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: "https://www.vinted.fr",
    },
    body: {
      check: "vinted_listing_field_injection",
      status: "passed",
      url: "https://www.vinted.fr/items/new",
      path: "/items/new",
      result: { injected: true },
      selectors: { button: "#quickvint-gen-btn" },
      extensionVersion: "1.3.58",
    },
  };
}

describe("DOM canary endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.DOM_CANARY_SECRET = "machine-secret";
    extractRequestMetadataMock.mockReturnValue({ userAgent: "vitest" });
    logRequestMock.mockResolvedValue(undefined);
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });
  });

  it("accepts the machine canary secret without a Supabase user token", async () => {
    const handlerModule = await import("../../../api/dom-canary.js");
    const handler = handlerModule.default as any;
    const res = createResponse();

    await handler(createRequest("machine-secret") as any, res as any);

    expect(res.statusCode).toBe(202);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(logRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/dom-canary",
        responseStatus: 202,
        userEmail: "dom-canary@autolister.app",
        suspiciousActivity: false,
        flaggedReason: "DOM canary passed",
      }),
    );
    expect(logRequestMock.mock.calls[0][0].userId).toBeUndefined();
  });

  it("rejects an invalid token when it is not a Supabase user token", async () => {
    const handlerModule = await import("../../../api/dom-canary.js");
    const handler = handlerModule.default as any;
    const res = createResponse();

    await handler(createRequest("wrong-token") as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(logRequestMock).not.toHaveBeenCalled();
  });
});
