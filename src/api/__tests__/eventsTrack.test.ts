import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

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

  it.each([false, true])(
    "durably retains drop evidence and deduplicates retries (internal account: %s)",
    async (internal) => {
      const { ApiLogger } = await import("../../../utils/apiLogger.js");
      vi.spyOn(ApiLogger, "isInternalLogExcludedEmail").mockReturnValue(
        internal,
      );
      const db = new PGlite();
      try {
        await db.exec(
          "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
        );
        await db.exec(
          readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
        );
        rpcMock.mockImplementation(async (name, args) => {
          const result = await db.query<any>(
            "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
            [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
          );
          return { data: result.rows[0].result };
        });
        const id = "a423926a-35a6-4bf5-8027-8ab335c72223";
        const occurredAt = new Date().toISOString();
        const context = {
          queueDropped: 57,
          queueDroppedExpired: 50,
          queueDroppedCapacity: 5,
          queueDroppedRejected: 2,
          queueDroppedCritical: 1,
          queueDroppedCustomerReports: 1,
          queueDropLastRejection: "expired",
          authorization: "Bearer private",
          photos: ["private-photo"],
          message: "internal product detail",
        };
        const body = {
          schemaVersion: 2,
          events: [
            {
              id,
              occurredAt,
              event: "token_refresh_start",
              source: "extension_background",
              extensionVersion: "1.4.11",
              context,
            },
          ],
        };
        expect((await postEvent(body)).body).toMatchObject({
          acknowledgedIds: [id],
        });
        expect((await postEvent(body)).body).toMatchObject({
          duplicateIds: [id],
        });
        const rows = (
          await db.query<any>("SELECT endpoint,full_request_body FROM api_logs")
        ).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          endpoint: "/event/telemetry_queue_dropped",
          full_request_body: {
            event: "token_refresh_start",
            occurredAt,
            transportEventId: id,
            extensionVersion: "1.4.11",
            context: {
              queueDropped: 57,
              queueDroppedExpired: 50,
              queueDroppedCapacity: 5,
              queueDroppedRejected: 2,
              queueDroppedCritical: 1,
              queueDroppedCustomerReports: 1,
              queueDropLastRejection: "expired",
            },
          },
        });
        expect(JSON.stringify(rows)).not.toMatch(/private/);
        if (internal)
          expect(JSON.stringify(rows)).not.toMatch(/internal product detail/);
        expect(
          (
            await db.query<any>(
              "SELECT client_dropped FROM incident_daily_budgets",
            )
          ).rows,
        ).toEqual([{ client_dropped: 57 }]);
        expect(
          (await db.query<any>("SELECT id FROM incident_groups")).rows,
        ).toHaveLength(0);
      } finally {
        rpcMock.mockReset();
        await db.close();
      }
    },
  );

  it("saves legacy generation pairs without creating running watchdog flows", async () => {
    const response = await postEvent({
      events: [
        {
          event: "generate_request",
          source: "extension_content",
          extensionVersion: "1.4.6",
          context: { generationAttemptId: "legacy-attempt", photoCount: 4 },
        },
        {
          event: "generate_success",
          source: "extension_content",
          extensionVersion: "1.4.6",
          context: { photoCount: 4 },
        },
      ],
    });
    expect(response.statusCode).toBe(204);
    const writes = rpcMock.mock.calls
      .filter(([name]) => name === "incident_ingest")
      .map(([, args]) => args.p_event);
    expect(writes).toHaveLength(2);
    expect(writes.map((event) => event.definition)).toEqual([
      { kind: "checkpoint", stage: "generation_requested", running: false },
      { kind: "checkpoint", stage: "generation_received", running: false },
    ]);
    expect(writes[0].operationId).toBe("legacy-attempt");
    expect(writes[1].operationId).toBeNull();
    for (const event of writes) {
      expect(event.context.photoCount).toBe(4);
      expect(event.businessLog.endpoint).toBe(`/event/${event.event}`);
    }
  });

  it("does not raise legacy generation stalls in the real database sweep", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; " +
          "CREATE TABLE api_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, user_email text, endpoint text, request_method text, response_status integer, user_agent text, origin text, ip_address text, full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      rpcMock.mockImplementation(async (name, args) => {
        expect(name).toBe("incident_ingest");
        const result = await db.query<{ result: unknown }>(
          "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
          [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
        );
        return { data: result.rows[0].result, error: null };
      });
      const response = await postEvent({
        events: [
          {
            event: "generate_request",
            source: "extension_content",
            context: { generationAttemptId: "legacy-request" },
          },
          { event: "generate_success", source: "extension_content" },
        ],
      });
      expect(response.statusCode).toBe(204);
      await db.exec(
        "UPDATE incident_flows SET last_progress_at=now()-interval '6 minutes'; SELECT incident_sweep(100);",
      );
      expect((await db.query("SELECT * FROM incident_groups")).rows).toEqual(
        [],
      );
      const flows = (await db.query("SELECT running FROM incident_flows")).rows;
      expect(flows).toEqual([{ running: false }, { running: false }]);
      expect((await db.query("SELECT id FROM api_logs")).rows).toHaveLength(2);
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
  });

  it("watches version 2 generation requests but stops the timer after receipt regardless of release label", async () => {
    const events = ["generate_request", "generate_success"].map(
      (event, index) => ({
        id: `a423926a-35a6-4bf5-8027-8ab335c7111${index}`,
        occurredAt: new Date().toISOString(),
        event,
        source: "extension_content",
        extensionVersion: "1.4.6",
        context: { generationAttemptId: "correlated-attempt", photoCount: 4 },
      }),
    );
    const response = await postEvent({ schemaVersion: 2, events });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      acknowledgedIds: events.map((event) => event.id),
    });
    const writes = rpcMock.mock.calls
      .filter(([name]) => name === "incident_ingest")
      .map(([, args]) => args.p_event);
    expect(writes).toHaveLength(2);
    expect(writes.map((event) => event.definition)).toEqual([
      { kind: "checkpoint", stage: "generation_requested", running: true },
      { kind: "checkpoint", stage: "generation_received", running: false },
    ]);
    expect(
      writes.every((event) => event.operationId === "correlated-attempt"),
    ).toBe(true);
  });

  it("still records explicit legacy generation failures as incidents", async () => {
    const response = await postEvent({
      event: "generate_error",
      source: "extension_content",
      extensionVersion: "1.4.6",
      context: { generationAttemptId: "failed-attempt", statusCode: 500 },
    });
    expect(response.statusCode).toBe(204);
    const write = rpcMock.mock.calls.find(
      ([name]) => name === "incident_ingest",
    )![1].p_event;
    expect(write.definition.kind).toBe("incident");
    expect(write.operationId).toBe("failed-attempt");
  });

  it.each(["checkout_start", "billing_portal_start"])(
    "retains uncorrelated %s evidence without creating a false running flow",
    async (event) => {
      const response = await postEvent(
        {
          schemaVersion: 2,
          events: [
            {
              id: "c423926a-35a6-4bf5-8027-8ab335c71110",
              occurredAt: new Date().toISOString(),
              event,
              source: "website",
              context: {},
            },
          ],
        },
        false,
      );
      expect(response.statusCode).toBe(200);
      const write = rpcMock.mock.calls.find(
        ([name]) => name === "incident_ingest",
      )![1].p_event;
      expect(write.definition).toMatchObject({
        kind: "checkpoint",
        stage: "checkout_requested",
        running: false,
      });
    },
  );

  it("ends correlated checkout flows in the real sweep while retaining genuine pending requests and failures", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, user_email text, endpoint text, request_method text, response_status integer, user_agent text, origin text, ip_address text, full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      rpcMock.mockImplementation(async (name, args) => {
        expect(name).toBe("incident_ingest");
        const result = await db.query<{ result: unknown }>(
          "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
          [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
        );
        return { data: result.rows[0].result, error: null };
      });
      const pairs = [
        ["checkout_start", null],
        ["billing_portal_start", null],
        ["checkout_start", "complete"],
        ["checkout_opened", "complete"],
        ["billing_portal_start", "portal"],
        ["billing_portal_opened", "portal"],
        ["checkout_start", "failed"],
        ["checkout_failed", "failed"],
        ["checkout_start", "pending"],
      ];
      const response = await postEvent(
        {
          schemaVersion: 2,
          events: pairs.map(([event, operationId], index) => ({
            id: `c423926a-35a6-4bf5-8027-8ab335c7111${index}`,
            occurredAt: new Date(Date.now() + index).toISOString(),
            event,
            source: "website",
            context: {
              ...(operationId ? { operationId } : {}),
              ...(event === "checkout_failed"
                ? {
                    stage: "checkout_requested",
                    errorCode: "CHECKOUT_REQUEST_ERROR",
                  }
                : {}),
            },
          })),
        },
        false,
      );
      expect(response.statusCode).toBe(200);
      await db.exec(
        "UPDATE incident_flows SET last_progress_at=now()-interval '6 minutes'; SELECT incident_sweep(100);",
      );
      const groups = (
        await db.query("SELECT event FROM incident_groups ORDER BY event")
      ).rows;
      expect(groups).toEqual([
        { event: "checkout_failed" },
        { event: "operation_possibly_stalled" },
      ]);
      const stalled = (
        await db.query(
          "SELECT examples->0->>'operationId' AS operation FROM incident_groups WHERE event='operation_possibly_stalled'",
        )
      ).rows;
      expect(stalled).toEqual([{ operation: "pending" }]);
      expect(
        (await db.query("SELECT * FROM incident_flows WHERE running=true"))
          .rows,
      ).toEqual([]);
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
  });

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

  it("acknowledges a report only after its permanent record commits, then deduplicates a lost reply", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE profiles(id uuid PRIMARY KEY,email text); CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
      );
      for (const migration of [
        "2026-10-03_incident_tracking.sql",
        "2026-10-08_customer_report_history.sql",
      ])
        await db.exec(readFileSync(`migrations/${migration}`, "utf8"));
      rpcMock.mockImplementation(async (name, args) => {
        expect(name).toBe("incident_ingest");
        try {
          const result = await db.query<any>(
            "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
            [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
          );
          return { data: result.rows[0].result };
        } catch (error) {
          return { error };
        }
      });
      const id = "a423926a-35a6-4bf5-8027-8ab335c72222";
      const body = {
        schemaVersion: 2,
        events: [
          {
            id,
            occurredAt: new Date().toISOString(),
            event: "listing_report_submitted",
            source: "extension_content",
            context: {
              category: "tool_bug",
              message: "My photos disappeared",
              operationId: id,
              userId: "forged",
            },
          },
        ],
      };
      await db.exec(
        "ALTER TABLE api_logs ADD CONSTRAINT reject_report CHECK(endpoint <> '/event/listing_report_submitted')",
      );
      const failed = await postEvent(body);
      expect(failed.statusCode).toBe(503);
      expect(failed.body).toMatchObject({
        acknowledgedIds: [],
        duplicateIds: [],
      });
      await db.exec("ALTER TABLE api_logs DROP CONSTRAINT reject_report");
      const accepted = await postEvent(body);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.body).toMatchObject({ acknowledgedIds: [id] });
      const retried = await postEvent(body);
      expect(retried.body).toMatchObject({
        acknowledgedIds: [],
        duplicateIds: [id],
        reports: (accepted.body as any).reports,
      });
      expect(
        (
          await db.query<any>(
            "SELECT user_id,full_request_body->'context' AS context FROM api_logs",
          )
        ).rows,
      ).toEqual([
        {
          user_id: USER_ID,
          context: {
            category: "tool_bug",
            message: "My photos disappeared",
            operationId: id,
          },
        },
      ]);
      expect(
        (await db.query<any>("SELECT occurrences FROM incident_groups")).rows,
      ).toEqual([{ occurrences: 1 }]);
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
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
