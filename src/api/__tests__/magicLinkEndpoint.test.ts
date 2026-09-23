import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLinkMock = vi.fn();
const resendSendMock = vi.fn();
const logRequestMock = vi.fn();
const reportCriticalEndpointFailureMock = vi.fn();

vi.mock("cors", () => ({
  default: vi.fn((options: any) => {
    return (req: any, res: any, callback: (err?: unknown) => void) => {
      options.origin(
        req.headers?.origin,
        (error: unknown, allowed: boolean) => {
          if (error) {
            callback(error);
            return;
          }
          if (allowed && req.headers?.origin) {
            res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
          }
          if (options.methods) {
            res.setHeader(
              "Access-Control-Allow-Methods",
              options.methods.join(","),
            );
          }
          if (options.allowedHeaders) {
            res.setHeader(
              "Access-Control-Allow-Headers",
              options.allowedHeaders.join(","),
            );
          }
          callback();
        },
      );
    };
  }),
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
      admin: {
        generateLink: generateLinkMock,
      },
    },
  },
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {
      emails: {
        send: resendSendMock,
      },
    };
  }),
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: reportCriticalEndpointFailureMock,
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
    headers: {} as Record<string, string>,
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name.toLowerCase()] = value;
      return res;
    }),
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

async function invokeMagicLink({
  method = "POST",
  headers = { origin: "chrome-extension://test-extension" },
  body = { email: "seller@example.com" },
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) {
  const handlerModule = await import("../../../api/auth/magic-link.js");
  const handler = handlerModule.default as unknown as (
    req: unknown,
    res: unknown,
  ) => Promise<unknown>;
  const res = createResponse();

  await handler({ method, headers, body } as any, res as any);
  return res;
}

describe("magic link endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "resend-key";
    process.env.AUTH_CALLBACK_URL = "";
    process.env.MOBILE_WEB_APP_ENABLED = "true";
    process.env.VERCEL_APP_ALLOWED_ORIGINS =
      "chrome-extension://test-extension";
    process.env.VERCEL_APP_SITE_URL = "chrome-extension://legacy-extension";
    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          action_link: "https://autolister.app/auth/callback#access_token=a",
          email_otp: "123456",
        },
      },
      error: null,
    });
    resendSendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("uses the app callback only for the validated mobile client", async () => {
    const res = await invokeMagicLink({
      headers: { origin: "https://autolister.app" },
      body: {
        email: "seller@example.com",
        client: "mobile_web",
        redirectTo: "https://evil.example",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          redirectTo: "https://autolister.app/app/auth/callback",
        },
      }),
    );
  });

  it("uses an approved HTTPS preview origin for mobile callbacks", async () => {
    process.env.VERCEL_APP_ALLOWED_ORIGINS =
      "chrome-extension://test-extension, https://preview.autolister.app";

    const res = await invokeMagicLink({
      headers: { origin: "https://preview.autolister.app" },
      body: {
        email: "seller@example.com",
        client: "mobile_web",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          redirectTo: "https://preview.autolister.app/app/auth/callback",
        },
      }),
    );
  });

  it("keeps a mobile request on the HTTPS app callback from an extension origin", async () => {
    const res = await invokeMagicLink({
      headers: { origin: "chrome-extension://test-extension" },
      body: {
        email: "seller@example.com",
        client: "mobile_web",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          redirectTo: "https://autolister.app/app/auth/callback",
        },
      }),
    );
  });

  it("keeps the extension callback for an unknown client context", async () => {
    const res = await invokeMagicLink({
      body: {
        email: "seller@example.com",
        client: "mobile_web_preview",
        redirectTo: "https://evil.example",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { redirectTo: "https://autolister.app/auth/callback" },
      }),
    );
  });

  it("returns the mobile disabled response without generating an extension link", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";
    const res = await invokeMagicLink({
      headers: { origin: "https://autolister.app" },
      body: { email: "seller@example.com", client: "mobile_web" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: "Mobile web app unavailable.",
      code: "mobile_web_disabled",
    });
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("keeps extension magic links enabled when the mobile flag is disabled", async () => {
    process.env.MOBILE_WEB_APP_ENABLED = "false";

    const res = await invokeMagicLink({
      body: { email: "seller@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { redirectTo: "https://autolister.app/auth/callback" },
      }),
    );
  });

  it("allows the app origin on the magic-link preflight", async () => {
    const res = await invokeMagicLink({
      method: "OPTIONS",
      headers: {
        origin: "https://autolister.app",
        "access-control-request-method": "POST",
        "access-control-request-headers": "Content-Type",
      },
      body: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://autolister.app",
    );
  });

  it("uses the HTTPS auth callback bridge instead of direct chrome-extension redirects", async () => {
    const res = await invokeMagicLink();

    expect(res.statusCode).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: "magiclink",
      email: "seller@example.com",
      options: {
        redirectTo: "https://autolister.app/auth/callback",
      },
    });
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["seller@example.com"],
        subject: "Sign in to AutoLister AI",
        html: expect.stringContaining("123456"),
      }),
    );
    expect(logRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/auth/magic-link",
        responseStatus: 200,
      }),
    );
  });

  it("returns 429 without Sentry for Supabase auth email cooldowns", async () => {
    generateLinkMock.mockResolvedValue({
      data: null,
      error: {
        name: "AuthApiError",
        message:
          "For security purposes, you can only request this after 35 seconds.",
      },
    });
    const res = await invokeMagicLink();

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      error:
        "Too many sign-in email requests. Please wait a few minutes before trying again.",
    });
    expect(logRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/auth/magic-link",
        responseStatus: 429,
        flaggedReason: "supabase_auth_cooldown",
      }),
    );
    expect(reportCriticalEndpointFailureMock).not.toHaveBeenCalled();
  });
});
