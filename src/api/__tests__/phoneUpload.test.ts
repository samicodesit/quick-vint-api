import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
const uploadMock = vi.fn();
const createSignedUrlMock = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        list: listMock,
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
      })),
    },
  },
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, unknown>,
    setHeader: vi.fn((name: string, value: unknown) => {
      response.headers[name] = value;
      return response;
    }),
    getHeader: vi.fn((name: string) => response.headers[name]),
    end: vi.fn(() => response),
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

describe("phone upload endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores selected total before single uploads start", async () => {
    uploadMock.mockResolvedValue({ error: null });

    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          sessionId: "sess-test",
          expectedCount: "10",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, expectedCount: 10 });
    expect(uploadMock).toHaveBeenCalledWith(
      "sess-test/_expected-count-10.json",
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/json",
        upsert: true,
      }),
    );
  });

  it("returns uploaded count and selected total separately", async () => {
    listMock.mockResolvedValue({
      data: [
        { name: "_expected-count-10.json" },
        { name: "000000-a.jpg" },
        { name: "000001-b.jpg" },
      ],
      error: null,
    });
    createSignedUrlMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://signed.test/${path}` },
        error: null,
      }),
    );

    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: { sessionId: "sess-test" },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      count: 2,
      expectedCount: 10,
      complete: false,
    });
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files.map((file: any) => file.name)).toEqual([
      "000000-a.jpg",
      "000001-b.jpg",
    ]);
  });

  it("returns 202 while expected batch files are still settling", async () => {
    listMock.mockResolvedValue({
      data: [{ name: "000000-a.jpg" }, { name: "000001-b.jpg" }],
      error: null,
    });

    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "complete",
          sessionId: "sess-test",
          expectedCount: "3",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      success: false,
      complete: false,
      settling: true,
      count: 2,
      expectedCount: 3,
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
