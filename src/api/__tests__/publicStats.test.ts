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

function dailyStatsQuery(result: unknown) {
  const query = {
    select: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

describe("public stats endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached public marketing totals", async () => {
    const statsQuery = dailyStatsQuery({
      data: [
        { total_api_calls: 1200 },
        { total_api_calls: "3000" },
      ],
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "daily_stats") {
        return statsQuery;
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
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=600");
    expect(fromMock).toHaveBeenCalledWith("daily_stats");
    expect(statsQuery.select).toHaveBeenCalledWith("total_api_calls");
    expect(res.body).toMatchObject({
      totalGenerations: 4200,
    });
    const body = res.body as { generatedAt: string };
    expect(new Date(body.generatedAt).toString()).not.toBe("Invalid Date");
  });

  it("returns 503 when stats cannot be loaded", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "daily_stats") {
        return dailyStatsQuery({ data: null, error: { message: "db down" } });
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
