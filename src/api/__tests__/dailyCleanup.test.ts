import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanupExpiredRecords = vi.fn(async () => {});
const cleanupDraftPhotos = vi.fn(async () => 0);
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

vi.mock("../../../utils/listingDrafts", () => ({ cleanupDraftPhotos }));

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

  it("deletes expired retained photos and keeps younger photos in the same folder", async () => {
    const handler = (await import("../../../api/cron/daily-cleanup.js"))
      .default as any;
    const folder = "_review-00000000-0000-4000-8000-000000000001";
    const expired = `${Date.now() - 1000}-000000-upload.jpg`;
    const young = `${Date.now() + 3600000}-000001-upload.jpg`;
    storageList.mockImplementation(async (prefix?: string) => ({
      data:
        prefix === ""
          ? [{ id: null, name: folder, created_at: null }]
          : [expired, young].map((name) => ({
              id: "object",
              name,
              created_at: null,
            })),
      error: null,
    }));
    const res = createResponse();
    await handler(authorizedRequest() as any, res as any);
    expect(storageRemove).toHaveBeenCalledWith([`${folder}/${expired}`]);
    expect(JSON.stringify(storageRemove.mock.calls)).not.toContain(young);
    expect(res.body.results.tempUploads.success).toBe(true);
  });

  it("returns failure to the scheduler if retained photo deletion fails", async () => {
    const handler = (await import("../../../api/cron/daily-cleanup.js"))
      .default as any;
    storageList.mockImplementation(async (prefix?: string) => ({
      data:
        prefix === ""
          ? [{ id: null, name: "_review-session", created_at: null }]
          : [
              {
                id: "object",
                name: `${Date.now() - 1000}-000000-upload.jpg`,
                created_at: null,
              },
            ],
      error: null,
    }));
    storageRemove.mockResolvedValueOnce({
      error: { message: "storage unavailable" },
    } as any);
    const res = createResponse();
    await handler(authorizedRequest() as any, res as any);
    expect(res.statusCode).toBe(500);
    expect(res.body.results.tempUploads.success).toBe(false);
    expect(compactOldLogs).toHaveBeenCalled();
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

  it("reports failed compaction to the scheduler while completing other cleanup", async () => {
    compactOldLogs.mockRejectedValueOnce({
      code: "57014",
      message: "canceling statement due to statement timeout",
    });
    const module = await import("../../../api/cron/daily-cleanup.js");
    const res = createResponse();

    await (module as any).default(authorizedRequest() as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.body.results.apiLogs.success).toBe(false);
    expect(res.body.results.apiLogs.error).toBe(
      "canceling statement due to statement timeout",
    );
    expect(res.body.results.tempUploads.success).toBe(true);
    expect(cleanupDraftPhotos).toHaveBeenCalledTimes(1);
    expect(res.body.results.listingDraftPhotos.success).toBe(true);
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
