import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const sendMock = vi.fn();
const logRequestsMock = vi.fn();
const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const profileQuery = {
  select: vi.fn(() => profileQuery),
  eq: vi.fn(() => profileQuery),
  maybeSingle: maybeSingleMock,
};

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: sendMock } };
  }),
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: vi.fn(() => ({})),
    logRequest: vi.fn(),
    logRequests: logRequestsMock,
  },
}));

vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount: vi.fn(),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: vi.fn(() => profileQuery),
  },
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, unknown>,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
    end: vi.fn(() => response),
    setHeader: vi.fn((name: string, value: unknown) => {
      response.headers[name] = value;
      return response;
    }),
    getHeader: vi.fn((name: string) => response.headers[name]),
  };
  return response;
}

describe("events tracking attribution helpers", () => {
  beforeAll(() => {
    process.env.VERCEL_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "test-service-role-key-for-import-only";
  });

  async function loadHelpers() {
    return import("../../../api/events/track.js");
  }

  it("keeps uninstall user identity from the uninstall page payload", async () => {
    const { canAttributePublicUninstallEvent, normalizeEventItems } =
      await loadHelpers();
    const [item] = normalizeEventItems({
      event: "extension_uninstalled",
      source: "uninstall_page",
      page: "/uninstall",
      userId: USER_ID,
      context: {
        analyticsClientId: "cid-123",
        extensionVersion: "1.3.24",
      },
    });

    expect(item.userId).toBe(USER_ID);
    expect(canAttributePublicUninstallEvent(item)).toBe(true);
  });

  it("does not allow non-uninstall events to claim a public user id", async () => {
    const { canAttributePublicUninstallEvent, normalizeEventItems } =
      await loadHelpers();
    const [item] = normalizeEventItems({
      event: "chrome_store_click",
      source: "site",
      page: "/",
      userId: USER_ID,
    });

    expect(item.userId).toBe(USER_ID);
    expect(canAttributePublicUninstallEvent(item)).toBe(false);
  });

  it("rejects malformed uninstall user ids", async () => {
    const { canAttributePublicUninstallEvent, isUuid, normalizeEventItems } =
      await loadHelpers();
    const [item] = normalizeEventItems({
      event: "uninstall_feedback_submitted",
      source: "uninstall_page",
      page: "/uninstall",
      userId: "not-a-user-id",
    });

    expect(isUuid(item.userId)).toBe(false);
    expect(canAttributePublicUninstallEvent(item)).toBe(false);
  });
});

describe("events tracking endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "resend-key";
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_ID, email: "seller@example.com" } },
    });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    logRequestsMock.mockResolvedValue(undefined);
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  afterEach(() => vi.restoreAllMocks());

  async function postEvent(
    body: Record<string, unknown>,
    authenticated = true,
  ) {
    const module = await import("../../../api/events/track.js");
    const handler = (module as any).default;
    const response = createResponse();
    await handler(
      {
        method: "POST",
        headers: authenticated ? { authorization: "Bearer token" } : {},
        body,
      } as any,
      response as any,
    );
    return response;
  }

  it("emails each accepted listing report", async () => {
    const response = await postEvent({
      event: "listing_report_submitted",
      source: "extension_content",
      page: "https://www.vinted.nl/items/new",
      plan: "pro",
      extensionVersion: "1.3.25",
      context: {
        category: "tool_bug",
        message: "The generated title is empty",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith({
      from: "AutoLister AI Alerts <alerts@autolister.app>",
      to: "samicodesit@gmail.com",
      subject: "Listing report: tool_bug",
      text: expect.stringMatching(
        /"message": "The generated title is empty"[\s\S]*"userEmail": "seller@example.com"[\s\S]*"plan": "pro"[\s\S]*"page": "https:\/\/www\.vinted\.nl\/items\/new"[\s\S]*"extensionVersion": "1\.3\.25"/,
      ),
    });
  });

  it("does not email other tracking events", async () => {
    const response = await postEvent({
      event: "listing_report_opened",
      context: { source: "listing_tools" },
    });

    expect(response.statusCode).toBe(204);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not let anonymous report events trigger email", async () => {
    const response = await postEvent(
      {
        event: "listing_report_submitted",
        context: { category: "other", message: "Something broke" },
      },
      false,
    );

    expect(response.statusCode).toBe(204);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not treat public uninstall attribution as report authentication", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: USER_ID, email: "seller@example.com" },
      error: null,
    });

    const response = await postEvent(
      {
        events: [
          {
            event: "uninstall_feedback_submitted",
            source: "uninstall_page",
            page: "/uninstall",
            userId: USER_ID,
          },
          {
            event: "listing_report_submitted",
            context: { category: "other", message: "Something broke" },
          },
        ],
      },
      false,
    );

    expect(response.statusCode).toBe(204);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("keeps an accepted report successful when Resend fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Resend down" },
    });

    const response = await postEvent({
      event: "listing_report_submitted",
      context: { category: "other", message: "Something broke" },
    });

    expect(response.statusCode).toBe(204);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to email listing report:",
      expect.any(Error),
    );
  });
});
