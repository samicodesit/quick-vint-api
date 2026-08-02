import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanupExpiredRecords = vi.fn(async () => {});
const compactOldLogs = vi.fn(async () => ({
  cutoffHours: 6,
  cutoffIso: "2026-06-27T06:00:00.000Z",
  batchSize: 500,
  compacted: 12,
}));
type StorageEntry = {
  id: string | null;
  name: string;
  created_at: string | null;
};
const storageList = vi.fn(
  async (): Promise<{ data: StorageEntry[]; error: null }> => ({
    data: [],
    error: null,
  }),
);
const storageRemove = vi.fn(async () => ({ error: null }));
const storageDownload = vi.fn();
const storageUpload = vi.fn(
  async (_path: string, _body: Buffer, _options: Record<string, unknown>) => ({
    error: null,
  }),
);

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
        remove: storageRemove,
        download: storageDownload,
        upload: storageUpload,
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
    process.env.CRON_SECRET = "test-cron-secret";
    storageList.mockResolvedValue({ data: [], error: null });
    compactOldLogs.mockResolvedValue({
      cutoffHours: 6,
      cutoffIso: "2026-06-27T06:00:00.000Z",
      batchSize: 500,
      compacted: 12,
    });
    storageDownload.mockReset();
    storageUpload.mockResolvedValue({ error: null });
  });

  const authorizedRequest = () => ({
    headers: { authorization: "Bearer test-cron-secret" },
  });

  it("rejects requests without the cron secret before doing cleanup work", async () => {
    const module = await import("../../../api/cron/daily-cleanup.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler({ headers: {} } as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(cleanupExpiredRecords).not.toHaveBeenCalled();
    expect(storageList).not.toHaveBeenCalled();
    expect(compactOldLogs).not.toHaveBeenCalled();
  });

  it("runs API log compaction with existing daily cleanup work", async () => {
    const module = await import("../../../api/cron/daily-cleanup.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(authorizedRequest() as any, res as any);

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

  it("keeps storage entries that have no creation timestamp", async () => {
    storageList
      .mockResolvedValueOnce({
        data: [
          { id: "root-file", name: "root.jpg", created_at: null },
          { id: null, name: "session", created_at: null },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: "nested-file", name: "nested.jpg", created_at: null }],
        error: null,
      });
    const module = await import("../../../api/cron/daily-cleanup.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(authorizedRequest() as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("removes an expired v2 session in one cleanup pass", async () => {
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    storageList
      .mockResolvedValueOnce({
        data: [{ id: null, name: "v2-session", created_at: old }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: "marker", name: "_session.json", created_at: old }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "marker", name: "_session.json", created_at: old },
          { id: "photo", name: "000000-upload.jpg", created_at: old },
        ],
        error: null,
      });
    storageDownload.mockResolvedValue({
      data: new Blob([
        JSON.stringify({
          v: 2,
          ownerId: "user-1",
          mode: "batch",
          source: "phone",
          status: "uploading",
          expectedCount: 1,
          createdAt: old,
          lastActivityAt: old,
          expiresAt: old,
        }),
      ]),
      error: null,
    });
    const module = await import("../../../api/cron/daily-cleanup.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(authorizedRequest() as any, res as any);

    expect(storageRemove).toHaveBeenCalledWith([
      "v2-session/_session.json",
      "v2-session/000000-upload.jpg",
    ]);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("removes a terminal v2 session and any remaining photos together", async () => {
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    storageList
      .mockResolvedValueOnce({
        data: [{ id: null, name: "v2-session", created_at: old }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: "marker", name: "_session.json", created_at: old }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "marker", name: "_session.json", created_at: old },
          { id: "photo", name: "000000-upload.jpg", created_at: old },
        ],
        error: null,
      });
    storageDownload.mockResolvedValue({
      data: new Blob([
        JSON.stringify({
          v: 2,
          status: "expired",
          expiresAt: old,
        }),
      ]),
      error: null,
    });
    const module = await import("../../../api/cron/daily-cleanup.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(authorizedRequest() as any, res as any);

    expect(storageRemove).toHaveBeenCalledWith([
      "v2-session/_session.json",
      "v2-session/000000-upload.jpg",
    ]);
  });
});
