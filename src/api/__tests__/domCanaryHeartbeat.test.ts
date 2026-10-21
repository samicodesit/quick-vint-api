import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const queryCalls: Array<[string, string, unknown]> = [];
let queryData: any[] = [];
let queryDataQueue: any[][] = [];
let queryError: any = null;
let fixtureRows: any[] | null = null;

const realInjectionFilter =
  "origin.eq.https://www.vinted.nl,and(full_request_body->>source.eq.extension_content,full_request_body->>page.like.https://www.vinted.nl/items/*)";

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {
      emails: {
        send: sendMock,
      },
    };
  }),
}));

function createBuilder() {
  const predicates: Array<(row: any) => boolean> = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      queryCalls.push(["eq", column, value]);
      predicates.push((row) => row[column] === value);
      return builder;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      queryCalls.push(["gte", column, value]);
      predicates.push((row) => row[column] >= String(value));
      return builder;
    }),
    or: vi.fn((filter: string) => {
      queryCalls.push(["or", "", filter]);
      predicates.push(
        (row) =>
          row.origin === "https://www.vinted.nl" ||
          (row.full_request_body?.source === "extension_content" &&
            /^https:\/\/www\.vinted\.nl\/items\//.test(
              row.full_request_body?.page || "",
            )),
      );
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({
      data: fixtureRows
        ? fixtureRows
            .filter((row) => predicates.every((p) => p(row)))
            .slice(0, 1)
        : queryDataQueue.length
          ? queryDataQueue.shift()
          : queryData,
      error: queryError,
    })),
  };
  return builder;
}

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => createBuilder()),
  },
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as unknown,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

describe("DOM canary heartbeat cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    queryCalls.length = 0;
    queryData = [];
    queryDataQueue = [];
    queryError = null;
    fixtureRows = null;
    process.env.CRON_SECRET = "cron-secret";
    process.env.RESEND_API_KEY = "resend-key";
    sendMock.mockResolvedValue({
      data: { id: "controlled-email" },
      error: null,
    });
  });

  it("requires a recent passed canary report as the live heartbeat", async () => {
    queryData = [
      {
        created_at: "2026-07-20T10:00:00.000Z",
        suspicious_activity: false,
      },
    ];
    const module = await import("../../../api/cron/dom-canary-heartbeat.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron-secret" } } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, stale: false });
    expect(sendMock).not.toHaveBeenCalled();
    expect(queryCalls).toContainEqual(["eq", "suspicious_activity", false]);
  });

  it.each([
    { data: null, error: { message: "Provider rejected alert" } },
    { data: {}, error: null },
  ])(
    "does not acknowledge a heartbeat alert the provider did not accept",
    async (result) => {
      sendMock.mockResolvedValue(result);
      const { default: handler }: { default: any } =
        await import("../../../api/cron/dom-canary-heartbeat.js");
      const res = createResponse();
      await handler(
        { headers: { authorization: "Bearer cron-secret" } } as any,
        res as any,
      );
      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ ok: false, stale: true });
    },
  );

  it("accepts recent real Vinted.nl listing injection telemetry as proof", async () => {
    queryDataQueue = [
      [],
      [
        {
          created_at: "2026-07-20T10:00:00.000Z",
          endpoint: "/event/listing_tools_ready",
          origin: "https://www.vinted.nl",
        },
      ],
    ];
    const module = await import("../../../api/cron/dom-canary-heartbeat.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron-secret" } } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      stale: false,
      source: "real_listing_tools_ready",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(queryCalls).toContainEqual([
      "eq",
      "endpoint",
      "/event/listing_tools_ready",
    ]);
    expect(queryCalls).toContainEqual(["or", "", realInjectionFilter]);
  });

  it("does not send a missing-heartbeat alert when background transport retained real NL injection", async () => {
    fixtureRows = [
      {
        created_at: new Date(Date.now() - 60_000).toISOString(),
        endpoint: "/event/listing_tools_ready",
        response_status: 204,
        origin: "chrome-extension://mommklhpammnlojjobejddmidmdcalcl",
        full_request_body: {
          event: "listing_tools_ready",
          source: "extension_content",
          page: "https://www.vinted.nl/items/new",
          extensionVersion: "1.4.21",
        },
      },
    ];
    const { default: handler }: { default: any } =
      await import("../../../api/cron/dom-canary-heartbeat.js");
    const res = createResponse();
    await handler(
      { headers: { authorization: "Bearer cron-secret" } } as any,
      res as any,
    );
    expect(res.body).toMatchObject({
      ok: true,
      stale: false,
      source: "real_listing_tools_ready",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(queryCalls).toContainEqual(["or", "", realInjectionFilter]);
  });

  it.each([
    { page: "https://www.vinted.fr/items/new" },
    { page: "https://www.vinted.nl.evil.test/items/new" },
    { page: "http://www.vinted.nl/items/new" },
    { page: "https://www.vinted.nl/" },
    { page: null },
    { source: "website" },
    { status: 500 },
    { ageHours: 31 },
  ])(
    "keeps a genuinely missing NL heartbeat alert visible: %j",
    async (change) => {
      fixtureRows = [
        {
          created_at: new Date(
            Date.now() - (change.ageHours ?? 1) * 3_600_000,
          ).toISOString(),
          endpoint: "/event/listing_tools_ready",
          response_status: change.status ?? 204,
          origin: "chrome-extension://mommklhpammnlojjobejddmidmdcalcl",
          full_request_body: {
            source: change.source ?? "extension_content",
            page:
              "page" in change
                ? change.page
                : "https://www.vinted.nl/items/new",
          },
        },
      ];
      const { default: handler }: { default: any } =
        await import("../../../api/cron/dom-canary-heartbeat.js");
      const res = createResponse();
      await handler(
        { headers: { authorization: "Bearer cron-secret" } } as any,
        res as any,
      );
      expect(res.body).toMatchObject({ ok: true, stale: true });
      expect(sendMock).toHaveBeenCalledOnce();
      expect(queryCalls).toContainEqual(["or", "", realInjectionFilter]);
    },
  );
});
