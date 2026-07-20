import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const queryCalls: Array<[string, string, unknown]> = [];
let queryData: any[] = [];
let queryError: any = null;

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
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      queryCalls.push(["eq", column, value]);
      return builder;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      queryCalls.push(["gte", column, value]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: queryData, error: queryError })),
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
    queryError = null;
    process.env.CRON_SECRET = "cron-secret";
    process.env.RESEND_API_KEY = "resend-key";
  });

  it("treats any recent canary report as a live heartbeat", async () => {
    queryData = [
      {
        created_at: "2026-07-20T10:00:00.000Z",
        suspicious_activity: true,
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
    expect(queryCalls).not.toContainEqual(["eq", "suspicious_activity", false]);
  });
});
