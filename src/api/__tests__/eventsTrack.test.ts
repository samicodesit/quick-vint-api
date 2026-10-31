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
    extractRequestMetadata: vi.fn((req) => ({
      userAgent: req.headers["user-agent"],
    })),
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
    userAgent = "Mozilla/5.0",
  ) {
    const module = await import("../../../api/events/track.js");
    const handler = (module as any).default;
    const response = createResponse();
    await handler(
      {
        method: "POST",
        headers: {
          ...(authenticated ? { authorization: "Bearer token" } : {}),
          "user-agent": userAgent,
        },
        body,
      } as any,
      response as any,
    );
    return response;
  }

  it("keeps seller edit text through ingestion without leaking it into diagnostics", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      rpcMock.mockImplementation(async (_name, args) => {
        const result = await db.query<any>(
          "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
          [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
        );
        return { data: result.rows[0].result };
      });
      const event = {
        id: "d623926a-35a6-4bf5-8027-8ab335c71111",
        occurredAt: new Date().toISOString(),
        event: "generation_output_edited",
        source: "extension_content",
        extensionVersion: "1.4.28",
        context: {
          generationAttemptId: "gen-edit",
          editSequence: 2,
          titleChanged: true,
          descriptionChanged: true,
          generatedTitle: "Czarna kurtka",
          finalTitle: "Czarna kurtka M",
          generatedDescription: "Bardzo dobra kurtka.\nRozmiar M",
          finalDescription: "Rozmiar M",
          previousDescription: "redundant",
          imageSources: [{ sourceUrl: "https://private.test/photo" }],
          access_token: "secret",
        },
      };
      expect(
        (await postEvent({ schemaVersion: 2, events: [event] })).body,
      ).toMatchObject({ acknowledgedIds: [event.id] });
      expect(
        (await postEvent({ schemaVersion: 2, events: [event] })).body,
      ).toMatchObject({ duplicateIds: [event.id] });
      const rows = (await db.query<any>("SELECT * FROM api_logs")).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].full_request_body.context).toMatchObject({
        generatedTitle: "Czarna kurtka",
        finalTitle: "Czarna kurtka M",
        generatedDescription: "Bardzo dobra kurtka.\nRozmiar M",
        finalDescription: "Rozmiar M",
      });
      expect(rows[0].user_id).toBe(USER_ID);
      expect(rows[0].user_email).toBeNull();
      expect(rows[0].user_agent).toBeNull();
      expect(JSON.stringify(rows)).not.toContain("redundant");
      expect(JSON.stringify(rows)).not.toContain("private.test");
      const args = rpcMock.mock.calls[0][1];
      expect(args.p_event.context).not.toHaveProperty("generatedTitle");
      expect(
        (await db.query("SELECT id FROM incident_groups")).rows,
      ).toHaveLength(0);
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
  }, 15000);

  it.each(["extension_content", "mobile_web"])(
    "keeps the request identity and occurrence time on %s form exposure",
    async (source) => {
      const occurredAt = new Date(Date.now() - 3600000).toISOString();
      const event = {
        id: "d623926a-35a6-4bf5-8027-8ab335c71122",
        occurredAt,
        source,
        accountId: USER_ID,
        event: "generation_output_visible",
        page: source === "mobile_web" ? "/app" : "/items/new",
        context: {
          generationAttemptId: "attempt",
          generationRequestId: "request",
        },
      };
      await postEvent({ schemaVersion: 2, events: [event] });
      expect(
        rpcMock.mock.calls[0][1].p_event.businessLog.full_request_body,
      ).toMatchObject({
        occurredAt,
        context: {
          generationAttemptId: "attempt",
          generationRequestId: "request",
        },
      });
    },
  );

  it("retains mobile saved-draft text and its request link only on the authenticated app path", async () => {
    const ev = {
      id: "d623926a-35a6-4bf5-8027-8ab335c71119",
      occurredAt: new Date().toISOString(),
      accountId: USER_ID,
      event: "generation_output_edited",
      source: "mobile_web",
      page: "/app",
      context: {
        generationAttemptId: "attempt",
        generationRequestId: "request",
        mode: "saved_draft",
        titleChanged: true,
        generatedTitle: "Coat",
        finalTitle: "Coat size S",
      },
    };
    const send = (event: typeof ev, auth = true) =>
      postEvent({ schemaVersion: 2, events: [event] }, auth);
    await send(ev);
    expect(
      rpcMock.mock.calls[0][1].p_event.businessLog.full_request_body.context,
    ).toMatchObject({
      textCaptureVersion: 1,
      finalTitle: "Coat size S",
      generationRequestId: "request",
      mode: "saved_draft",
    });
    rpcMock.mockClear();
    await send({ ...ev, page: "/other" });
    expect(
      rpcMock.mock.calls[0][1].p_event.businessLog.full_request_body.context,
    ).not.toHaveProperty("finalTitle");
    rpcMock.mockClear();
    await send(ev, false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("bounds and redacts edit text, preserves intentional empty strings, and excludes it from other events", async () => {
    const context = {
      generatedTitle: "Contact seller@example.com",
      finalTitle: "",
      generatedDescription: "🧥".repeat(2000),
      finalDescription: "Bearer private-token",
      previousTitle: "unneeded",
    };
    await postEvent({
      event: "generation_output_edited",
      source: "extension_content",
      context: { ...context, queueDropped: 2, queueDroppedCapacity: 2 },
    });
    const saved =
      rpcMock.mock.calls[0][1].p_event.businessLog.full_request_body.context;
    expect(saved.finalTitle).toBe("");
    expect(saved.generatedTitle).toContain("[email]");
    expect(saved.finalDescription).toBe("[credential]");
    expect(
      Buffer.byteLength(JSON.stringify(saved.generatedDescription)),
    ).toBeLessThanOrEqual(3074);
    expect(saved.textTruncatedFields).toContain("generatedDescription");
    expect(saved.textRedacted).toBe(true);
    expect(saved.queueDroppedCapacity).toBe(2);
    expect(saved).not.toHaveProperty("previousTitle");
    rpcMock.mockClear();
    await postEvent(
      {
        event: "generation_output_edited",
        source: "extension_content",
        context,
      },
      false,
    );
    expect(
      rpcMock.mock.calls[0][1].p_event.businessLog.full_request_body.context,
    ).not.toHaveProperty("generatedTitle");
    rpcMock.mockClear();
    await postEvent({ event: "generate_click", context });
    expect(
      rpcMock.mock.calls[0][1].p_event.businessLog.full_request_body.context,
    ).not.toHaveProperty("generatedTitle");
  });

  it("retains bounded batch outcome facts with original receipt correlation and no heavy customer payload", async () => {
    const occurredAt = new Date().toISOString();
    const res = await postEvent({
      schemaVersion: 2,
      events: [
        {
          id: "d623926a-35a6-4bf5-8027-8ab335c71110",
          event: "batch_complete",
          occurredAt,
          source: "extension_background",
          extensionVersion: "1.4.24",
          context: {
            batchId: "a423926a-35a6-4bf5-8027-8ab335c71110",
            analyticsClientId: "client-a",
            completedCount: 4,
            total: 4,
            recoveryAgeMs: 300000,
            pauseDurationMs: 120000,
            activeDurationMs: 180000,
            timingComplete: true,
            resumeTrigger: "user_resume",
          },
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    const args = rpcMock.mock.calls.find(
      ([name]) => name === "incident_ingest",
    )?.[1] as any;
    expect(args.p_event.businessLog).toMatchObject({
      endpoint: "/event/batch_complete",
      full_request_body: {
        analyticsOnly: true,
        transportEventId: "d623926a-35a6-4bf5-8027-8ab335c71110",
        occurredAt,
        context: {
          completedCount: 4,
          total: 4,
          recoveryAgeMs: 300000,
          pauseDurationMs: 120000,
          activeDurationMs: 180000,
          resumeTrigger: "user_resume",
        },
      },
    });
    expect(args.p_event.businessLog).not.toHaveProperty("user_email");
    expect(args.p_event.businessLog).not.toHaveProperty("ip_address");
  });

  it.each(["auth_action_result", "auth_session_result"])(
    "persists %s correlation through the endpoint and native SQL",
    async (eventName) => {
      const db = new PGlite();
      try {
        await db.exec(
          "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
        );
        await db.exec(
          readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
        );
        rpcMock.mockImplementation(async (_name, args) => {
          const result = await db.query<any>(
            "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
            [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
          );
          return { data: result.rows[0].result };
        });
        const outcomes =
          eventName === "auth_session_result"
            ? ["silent_renewed", "signed_in"]
            : [
                "refresh_joined",
                "credentials_returned",
                "blocked",
                "recovered",
                "succeeded",
              ];
        for (const [index, resultStatus] of outcomes.entries()) {
          const context = {
            operationId: "action-1",
            authRefreshOperationId: "refresh-1",
            parentOperationId: "action-1",
            entryPoint: "generate",
            resultStatus,
            ...(eventName === "auth_session_result"
              ? { signInRequired: false }
              : {}),
            attempt: index + 1,
          };
          const event = {
            id: `b423926a-35a6-4bf5-8027-8ab335c7222${index}`,
            occurredAt: new Date().toISOString(),
            event: eventName,
            extensionVersion: "1.4.20",
            source: index < 2 ? "extension_background" : "extension_content",
            context: { ...context, access_token: "private" },
          };
          expect(
            (await postEvent({ schemaVersion: 2, events: [event] })).body,
          ).toMatchObject({ acknowledgedIds: [event.id] });
          expect(
            (await postEvent({ schemaVersion: 2, events: [event] })).body,
          ).toMatchObject({ duplicateIds: [event.id] });
          const row = (
            await db.query<any>(
              "SELECT user_id,full_request_body FROM api_logs WHERE full_request_body->>'transportEventId'=$1",
              [event.id],
            )
          ).rows[0];
          expect(row).toMatchObject({
            user_id: USER_ID,
            full_request_body: { context },
          });
          expect(JSON.stringify(row)).not.toContain("private");
          if (eventName === "auth_session_result")
            expect(row.full_request_body).toMatchObject({
              occurredAt: event.occurredAt,
              transportEventId: event.id,
              extensionVersion: "1.4.20",
            });
        }
        expect(
          (await db.query<any>("SELECT id FROM api_logs")).rows,
        ).toHaveLength(outcomes.length);
        expect(
          (await db.query<any>("SELECT id FROM incident_groups")).rows,
        ).toHaveLength(0);
        expect(
          (await db.query<any>("SELECT id FROM incident_flows WHERE running"))
            .rows,
        ).toHaveLength(0);
      } finally {
        rpcMock.mockReset();
        await db.close();
      }
    },
    15000,
  );

  it.each([
    [
      "web_paywall_view",
      { reason: "plans", entryPoint: "profile_menu", tier: "free" },
    ],
    [
      "checkout_start",
      { reason: "plans", entryPoint: "profile_menu", tier: "pro" },
    ],
    [
      "web_style_setup",
      {
        phase: "complete",
        method: "apply",
        descriptionLength: "short",
        useBulletPoints: true,
        useHashtags: false,
        useEmojis: false,
        includeSellerNote: true,
      },
    ],
    [
      "web_style_setup",
      {
        phase: "complete",
        method: "skip",
        descriptionLength: "long",
        useBulletPoints: false,
        useHashtags: true,
        useEmojis: true,
        includeSellerNote: false,
      },
    ],
  ])(
    "retains safe %s funnel context through the endpoint and business log",
    async (event, choices) => {
      const context = {
        ...choices,
        source: "home_hero",
        webSessionId: "session-1",
        analyticsClientId: "browser-1",
      };
      const response = await postEvent({
        schemaVersion: 2,
        events: [
          {
            id: "b423926a-35a6-4bf5-8027-8ab335c72223",
            occurredAt: new Date().toISOString(),
            event,
            source: "mobile_web",
            page: "/app",
            context: {
              ...context,
              descriptionFooterText: "private note",
              imageUrl: "https://private.test/photo",
            },
          },
        ],
      });
      expect(response.statusCode).toBe(200);
      const write = rpcMock.mock.calls.find(
        ([name]) => name === "incident_ingest",
      )![1].p_event;
      expect(write.context).toEqual(context);
      expect(write.businessLog.full_request_body.context).toEqual(context);
      expect(write.definition.kind).toBe(
        event === "checkout_start" ? "checkpoint" : "business",
      );
      expect(write.definition.running).not.toBe(true);
    },
  );

  it.each(
    ["extension_content", "extension_popup", "website", "mobile_web"].flatMap(
      (source) =>
        ["checkout_start", "checkout_opened", "checkout_failed"].map(
          (event) => [source, event],
        ),
    ),
  )(
    "retains %s %s checkout evidence with safe attribution",
    async (source, event) => {
      const occurredAt = new Date(Date.now() - 60000).toISOString();
      const id = "c423926a-35a6-4bf5-8027-8ab335c72224";
      const context = {
        operationId: "checkout-attempt",
        checkoutType: "credit_pack",
        packId: "credits_50",
        limitCode: "free_lifetime_limit",
        errorCode: "checkout_unavailable",
      };
      await postEvent({
        schemaVersion: 2,
        events: [
          {
            id,
            occurredAt,
            event,
            source,
            context: {
              ...context,
              checkoutUrl: "https://checkout.stripe.com/private",
              token: "private",
            },
          },
        ],
      });
      const write = rpcMock.mock.calls.find(
        ([name]) => name === "incident_ingest",
      )![1].p_event;
      expect(write.businessLog?.full_request_body).toMatchObject({
        event,
        source,
        transportEventId: id,
        occurredAt,
        context,
      });
      expect(JSON.stringify(write.businessLog)).not.toContain("private");
      expect(write.definition.kind).toBe(
        event === "checkout_failed" ? "incident" : "checkpoint",
      );
    },
  );

  it("persists anonymous and verified web events once across response-loss retries", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      rpcMock.mockImplementation(async (_name, args) => {
        const result = await db.query<any>(
          "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
          [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
        );
        return { data: result.rows[0].result };
      });
      const visit = {
        id: "a423926a-35a6-4bf5-8027-8ab335c72223",
        occurredAt: new Date().toISOString(),
        event: "web_app_view",
        source: "mobile_web",
        page: "/app?secret=private",
        context: {
          analyticsClientId: "browser-1",
          webSessionId: "session-1",
          source: "home_hero",
          description: "private text",
          imageUrl: "private image",
          token: "private token",
        },
      };
      expect(
        (await postEvent({ schemaVersion: 2, events: [visit] }, false)).body,
      ).toMatchObject({ acknowledgedIds: [visit.id] });
      expect(
        (await postEvent({ schemaVersion: 2, events: [visit] }, false)).body,
      ).toMatchObject({ duplicateIds: [visit.id] });
      const auth = {
        ...visit,
        id: "b423926a-35a6-4bf5-8027-8ab335c72223",
        event: "auth_complete",
        accountId: USER_ID,
        context: {
          analyticsClientId: "browser-1",
          webSessionId: "session-1",
          method: "email",
        },
      };
      expect(
        (await postEvent({ schemaVersion: 2, events: [auth] })).body,
      ).toMatchObject({ acknowledgedIds: [auth.id] });
      expect(
        (await postEvent({ schemaVersion: 2, events: [auth] })).body,
      ).toMatchObject({ duplicateIds: [auth.id] });
      const checkout = {
        ...auth,
        id: "c423926a-35a6-4bf5-8027-8ab335c72223",
        event: "checkout_start",
        context: {
          tier: "starter",
          analyticsClientId: "browser-1",
          webSessionId: "session-1",
        },
      };
      expect(
        (await postEvent({ schemaVersion: 2, events: [checkout] })).body,
      ).toMatchObject({ acknowledgedIds: [checkout.id] });
      const rows = (
        await db.query<any>(
          "SELECT user_id,full_request_body FROM api_logs ORDER BY created_at",
        )
      ).rows;
      expect(rows).toHaveLength(3);
      expect(rows[0].user_id).toBeNull();
      expect(rows[1].user_id).toBe(USER_ID);
      expect(rows[0].full_request_body).toMatchObject({
        source: "mobile_web",
        page: "/app",
        transportEventId: visit.id,
        context: {
          analyticsClientId: "browser-1",
          webSessionId: "session-1",
          source: "home_hero",
        },
      });
      expect(rows[1].full_request_body.context.method).toBe("email");
      expect(rows[2].full_request_body).toMatchObject({
        event: "checkout_start",
        source: "mobile_web",
        transportEventId: checkout.id,
        context: { tier: "starter" },
      });
      const extensionCheckout = {
        ...checkout,
        id: "c423926a-35a6-4bf5-8027-8ab335c72225",
        source: "extension_content",
      };
      await postEvent({ schemaVersion: 2, events: [extensionCheckout] });
      await postEvent({ schemaVersion: 2, events: [extensionCheckout] });
      expect(
        (
          await db.query<any>(
            "SELECT id FROM api_logs WHERE full_request_body->>'transportEventId'=$1",
            [extensionCheckout.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (await db.query<any>("SELECT id FROM incident_flows WHERE running"))
          .rows,
      ).toHaveLength(0);
      expect(JSON.stringify(rows)).not.toContain("private");
      for (const [index, event] of [
        "home_hero_exposure",
        "chrome_store_click",
      ].entries()) {
        const item = {
          id: `e423926a-35a6-4bf5-8027-8ab335c7222${index}`,
          occurredAt: new Date(Date.now() - 3600000).toISOString(),
          event,
          source: "website",
          context: {
            analyticsClientId: "browser-1",
            heroExperiment: "mobile-entry-v1",
            heroVariant: "b",
          },
        };
        await postEvent(
          { schemaVersion: 2, events: [item] },
          false,
          "Googlebot/2.1",
        );
        const actual = (
          await db.query<any>(
            "SELECT full_request_body FROM api_logs WHERE endpoint=$1",
            [`/event/${event}`],
          )
        ).rows[0].full_request_body;
        expect(actual).toMatchObject({
          occurredAt: item.occurredAt,
          transportEventId: item.id,
          context: { heroExperiment: "mobile-entry-v1", heroVariant: "b" },
        });
        if (event === "home_hero_exposure")
          expect(actual.automatedTraffic).toBe(true);
      }
      expect(
        (await db.query<any>("SELECT id FROM incident_groups")).rows,
      ).toHaveLength(0);
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
  }, 15000);

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
          queueDroppedEventTypes:
            '{"generate_error":1,"token_refresh_failed":56}',
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
              queueDroppedEventTypes:
                '{"generate_error":1,"token_refresh_failed":56}',
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
    // Includes cold embedded PostgreSQL startup under the full suite's load,
    // matching the bounded fixture budget of the other database tests below.
    15000,
  );

  it("closes a successful batch parent without hiding a genuinely stalled batch", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      rpcMock.mockImplementation(async (name, args) => {
        if (name !== "incident_ingest") return { data: false };
        const result = await db.query<{ result: unknown }>(
          "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
          [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
        );
        return { data: result.rows[0].result, error: null };
      });
      // The real loaded-extension trace sends Done with both identifiers.
      const events = [
        { event: "batch_start", context: { batchId: "completed-batch" } },
        {
          event: "generate_request",
          context: {
            batchId: "completed-batch",
            generationAttemptId: "last-item",
          },
        },
        {
          event: "generate_success",
          context: {
            batchId: "completed-batch",
            generationAttemptId: "last-item",
          },
        },
        {
          event: "batch_worker_progress",
          context: {
            batchId: "completed-batch",
            generationAttemptId: "last-item",
          },
        },
        {
          event: "batch_done",
          context: {
            batchId: "completed-batch",
            generationAttemptId: "last-item",
          },
        },
        { event: "batch_start", context: { batchId: "genuine-stall" } },
      ];
      for (const [index, entry] of events.entries()) {
        const response = await postEvent({
          schemaVersion: 2,
          events: [
            {
              ...entry,
              id: `b423926a-35a6-4bf5-8027-8ab335c7333${index}`,
              occurredAt: new Date().toISOString(),
              source: "extension_content",
              extensionVersion: "1.4.17",
            },
          ],
        });
        expect(response.statusCode).toBe(200);
      }
      const completed = (
        await db.query<any>(
          "SELECT stage,running FROM incident_flows WHERE operation_id='completed-batch'",
        )
      ).rows;
      expect(completed).toEqual([{ stage: "user_review", running: false }]);
      await db.exec(
        "UPDATE incident_flows SET last_progress_at=now()-interval '10 minutes'",
      );
      await db.query("SELECT incident_sweep(100)");
      const incidents = (
        await db.query<any>(
          "SELECT examples FROM incident_groups WHERE event='operation_possibly_stalled'",
        )
      ).rows;
      expect(incidents).toHaveLength(1);
      expect(incidents[0].examples[0].operationId).toBe("genuine-stall");
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
  }, 15000);

  it("persists injected phone-script warnings without email while real exceptions still alert", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      rpcMock.mockImplementation(async (name, args) => {
        if (name !== "incident_ingest") return { data: false };
        const result = await db.query<{ result: unknown }>(
          "SELECT incident_ingest($1::jsonb,$2::uuid,$3::boolean) AS result",
          [JSON.stringify(args.p_event), args.p_user_id, args.p_verified],
        );
        return { data: result.rows[0].result, error: null };
      });
      const messages = [
        "TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
        "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')",
        "ReferenceError: Can't find variable: __firefox__",
      ];
      for (let n = 0; n < 4; n++) {
        const message = messages[n] || "La";
        const response = await postEvent({
          schemaVersion: 2,
          events: [
            {
              id: `b423926a-35a6-4bf5-8027-8ab335c7222${n}`,
              occurredAt: new Date().toISOString(),
              event: "own_context_exception",
              source: "phone_upload_page",
              context: {
                errorName:
                  n === 3 ? "Error" : n === 2 ? "ReferenceError" : "TypeError",
                message,
                stack: "global code@[url]",
                ...(n === 3
                  ? {
                      exceptionProvenance: {
                        version: 1,
                        pageRuntime: 1,
                        capture: "error",
                        location: {
                          source: "phone_page",
                          line: 726,
                          column: 18,
                          token: "private",
                        },
                        frames: [
                          { source: "phone_runtime", line: 726, column: 18 },
                        ],
                        filename:
                          "https://autolister.app/phone-upload?s=private",
                      },
                    }
                  : {}),
              },
            },
          ],
        });
        expect(response.statusCode).toBe(200);
      }
      const rows = (
        await db.query<any>(
          "SELECT event,severity,notification_status,examples FROM incident_groups",
        )
      ).rows;
      const warnings = rows.filter(
        (row) => row.event === "browser_script_exception",
      );
      expect(warnings).toHaveLength(2);
      expect(
        warnings.every(
          (row) =>
            row.severity === "warning" && row.notification_status === "quiet",
        ),
      ).toBe(true);
      expect(
        warnings
          .flatMap((row) => row.examples)
          .map((example) => example.context.message),
      ).toEqual(expect.arrayContaining(messages));
      expect(
        rows.find((row) => row.event === "own_context_exception"),
      ).toMatchObject({ severity: "blocking", notification_status: "pending" });
      const retained = rows.find((row) => row.event === "own_context_exception")
        .examples[0].context;
      expect(retained.exceptionProvenance).toEqual({
        version: 1,
        pageRuntime: 1,
        capture: "error",
        location: { source: "phone_page", line: 726, column: 18 },
        frames: [{ source: "phone_runtime", line: 726, column: 18 }],
      });
      expect(JSON.stringify(retained)).not.toContain("private");
    } finally {
      rpcMock.mockReset();
      await db.close();
    }
  }, 15000);

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
  }, 15000);

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
