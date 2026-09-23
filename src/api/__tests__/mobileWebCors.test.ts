import { beforeEach, describe, expect, it, vi } from "vitest";

const logRequestMock = vi.fn();
const extractRequestMetadataMock = vi.fn(() => ({}));

vi.mock("openai", () => ({
  OpenAI: vi.fn(function OpenAI() {
    return { chat: { completions: { create: vi.fn() } } };
  }),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: extractRequestMetadataMock,
    logRequest: logRequestMock,
  },
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    setHeader: vi.fn((name: string, value: unknown) => {
      response.headers[name.toLowerCase()] = value;
      return response;
    }),
    getHeader: vi.fn((name: string) => response.headers[name.toLowerCase()]),
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

function preflightHeaders(
  origin: string,
  requestedHeaders: string,
  method = "POST",
) {
  return {
    origin,
    "access-control-request-method": method,
    "access-control-request-headers": requestedHeaders,
  };
}

describe("mobile web CORS contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_APP_OPENAI_API_KEY = "test-openai-key";
    process.env.VERCEL_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.VERCEL_APP_ALLOWED_ORIGINS;
    logRequestMock.mockResolvedValue(undefined);
  });

  it("allows the mobile headers on the generate preflight", async () => {
    const handler = (await import("../../../api/generate.js")).default as any;
    const response = createResponse();

    await handler(
      {
        method: "OPTIONS",
        headers: preflightHeaders(
          "https://autolister.app",
          "Authorization, Content-Type, X-Autolister-Client, X-Autolister-Request-Id",
        ),
      } as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://autolister.app",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "X-Autolister-Client",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "X-Autolister-Request-Id",
    );
  });

  it("serves GET usage preflight with bearer and mobile context headers", async () => {
    const { runUsageCors } = await import("../../../utils/usageCors.js");
    const response = createResponse();

    await runUsageCors(
      {
        method: "OPTIONS",
        headers: preflightHeaders(
          "https://autolister.app",
          "Authorization, Content-Type, X-Autolister-Client",
          "GET",
        ),
      } as any,
      response as any,
    );

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://autolister.app",
    );
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-methods"]).toContain(
      "OPTIONS",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "X-Autolister-Client",
    );
  });

  it("keeps checkout POST preflight and adds bearer mobile context headers", async () => {
    const { handleCheckoutCors } =
      await import("../../../utils/checkoutCors.js");
    const response = createResponse();

    await handleCheckoutCors(
      {
        method: "OPTIONS",
        headers: preflightHeaders(
          "https://autolister.app",
          "Authorization, Content-Type, X-Autolister-Client",
        ),
      } as any,
      response as any,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://autolister.app",
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-methods"]).toContain(
      "OPTIONS",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "X-Autolister-Client",
    );
  });

  it("rejects an unapproved app origin on the generate preflight", async () => {
    const handler = (await import("../../../api/generate.js")).default as any;
    const response = createResponse();

    await handler(
      {
        method: "OPTIONS",
        headers: preflightHeaders(
          "https://evil.example",
          "Authorization, Content-Type, X-Autolister-Client",
        ),
      } as any,
      response as any,
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({
      error: expect.stringContaining("CORS origin denied for generate"),
    });
  });

  it("preserves the phone-upload preflight contract", async () => {
    const handler = (await import("../../../api/phone-upload.js"))
      .default as any;
    const response = createResponse();

    void handler(
      {
        method: "OPTIONS",
        headers: {
          origin: "https://vinted.fr",
          "access-control-request-method": "POST",
          "access-control-request-headers": "Authorization",
        },
        query: {},
      } as any,
      response as any,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://vinted.fr",
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });
});
