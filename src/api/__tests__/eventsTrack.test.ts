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
const logRequestsMock = vi.fn();
const rpcMock = vi.fn();
const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const profileQuery = {
  select: vi.fn(() => profileQuery),
  eq: vi.fn(() => profileQuery),
  maybeSingle: maybeSingleMock,
};

vi.mock("../../../utils/incidents/notifications", () => ({
  deliverPendingNotifications: vi.fn(async () => ({ sent: 0, failed: 0 })),
}));
vi.mock("../../../utils/incidents/service", () => ({
  continueIncidentWork: (work: Promise<unknown>) => {
    void work.catch(() => {});
  },
  captureAcceptedException: vi.fn(async () => {}),
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: vi.fn(() => ({})),
    logRequest: vi.fn(),
    logRequests: logRequestsMock,
    isInternalLogExcludedEmail: () => false,
  },
}));

vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount: vi.fn(),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: vi.fn(() => profileQuery),
    rpc: rpcMock,
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
    rpcMock.mockResolvedValue({
      data: { status: "accepted", incidentId: "issue-1" },
      error: null,
    });
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

  it("durably accepts authenticated listing reports", async () => {
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
    expect(rpcMock).toHaveBeenCalledWith(
      "incident_ingest",
      expect.objectContaining({
        p_verified: true,
        p_user_id: USER_ID,
        p_event: expect.objectContaining({
          event: "listing_report_submitted",
          definition: expect.objectContaining({ kind: "report" }),
        }),
      }),
    );
  });

  it("keeps ordinary product events distinct from reports", async () => {
    const response = await postEvent({
      event: "listing_report_opened",
      context: { source: "listing_tools" },
    });

    expect(response.statusCode).toBe(204);
    expect(
      rpcMock.mock.calls.every(
        ([, args]) =>
          args.p_event.event !== "listing_report_submitted" ||
          args.p_verified === false,
      ),
    ).toBe(true);
  });

  it("returns a retryable error when legacy persistence fails", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "database unavailable" },
    });
    const response = await postEvent({ event: "listing_tools_ready" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["Retry-After"]).toBe("60");
  });

  it("returns per-event v2 acknowledgements and explicit rejections", async () => {
    const id = "a423926a-35a6-4bf5-8027-8ab335c71110";
    const response = await postEvent({
      schemaVersion: 2,
      events: [
        {
          id,
          occurredAt: new Date().toISOString(),
          event: "fields_apply_failed",
          source: "extension_content",
        },
        { id: "bad", event: "fields_apply_failed" },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      acknowledgedIds: [id],
      duplicateIds: [],
      rejections: [{ id: "bad", reason: "invalid_id" }],
      reports: { [id]: "issue-1" },
    });
  });

  it("does not acknowledge v2 events after a database failure", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "db unavailable" },
    });
    const response = await postEvent({
      schemaVersion: 2,
      events: [
        {
          id: "a423926a-35a6-4bf5-8027-8ab335c71110",
          occurredAt: new Date().toISOString(),
          event: "fields_apply_failed",
        },
      ],
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ acknowledgedIds: [] });
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
    expect(
      rpcMock.mock.calls.every(
        ([, args]) =>
          args.p_event.event !== "listing_report_submitted" ||
          args.p_verified === false,
      ),
    ).toBe(true);
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
    expect(
      rpcMock.mock.calls.every(
        ([, args]) =>
          args.p_event.event !== "listing_report_submitted" ||
          args.p_verified === false,
      ),
    ).toBe(true);
  });

  it("accepts a report independently of notification delivery", async () => {
    const response = await postEvent({
      event: "listing_report_submitted",
      context: { category: "other", message: "Something broke" },
    });
    expect(response.statusCode).toBe(204);
    expect(rpcMock).toHaveBeenCalledOnce();
  });
});
