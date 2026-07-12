import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanupExpiredRecords = vi.fn(async () => {});
const compactOldLogs = vi.fn(async () => ({
  cutoffHours: 6,
  cutoffIso: "2026-06-27T06:00:00.000Z",
  batchSize: 500,
  compacted: 12,
}));
const storageList = vi.fn(async () => ({ data: [], error: null }));

vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: {
    cleanupExpiredRecords,
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    compactOldLogs,
  },
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        list: storageList,
        remove: vi.fn(async () => ({ error: null })),
      })),
    },
  },
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: any) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

describe("daily cleanup cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageList.mockResolvedValue({ data: [], error: null });
    compactOldLogs.mockResolvedValue({
      cutoffHours: 6,
      cutoffIso: "2026-06-27T06:00:00.000Z",
      batchSize: 500,
      compacted: 12,
    });
  });

  it("runs API log compaction with existing daily cleanup work", async () => {
    const module = await import("../../../api/cron/daily-cleanup.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler({ headers: {} } as any, res as any);

    expect(cleanupExpiredRecords).toHaveBeenCalledTimes(1);
    expect(storageList).toHaveBeenCalledWith("", {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    expect(compactOldLogs).toHaveBeenCalledWith({
      cutoffHours: 6,
      batchSize: 500,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.results.apiLogs).toEqual({
      success: true,
      compacted: 12,
      cutoffHours: 6,
      error: null,
    });
  });
});
