import { describe, expect, it, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: fromMock,
  },
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    setHeader: vi.fn((key: string, value: string) => {
      res.headers.set(key, value);
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
  };

  return res;
}

function logCountQuery(result: unknown) {
  let eqCalls = 0;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => {
      eqCalls += 1;
      return eqCalls >= 2 ? Promise.resolve(result) : query;
    }),
  };
  return query;
}

describe("public stats endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached public marketing totals", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "api_logs") {
        return logCountQuery({ count: 4200, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const handlerModule = await import("../../../api/public-stats.js");
    const handler = handlerModule.default as unknown as (
      req: unknown,
      res: unknown,
    ) => Promise<unknown>;
    const res = createResponse();

    await handler({ method: "GET" } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=900");
    expect(res.body).toEqual({
      totalGenerations: 4200,
    });
  });

  it("returns 503 when stats cannot be loaded", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "api_logs") {
        return logCountQuery({ count: null, error: { message: "db down" } });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const handlerModule = await import("../../../api/public-stats.js");
    const handler = handlerModule.default as unknown as (
      req: unknown,
      res: unknown,
    ) => Promise<unknown>;
    const res = createResponse();

    await handler({ method: "GET" } as any, res as any);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Stats unavailable." });
  });
});
