import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        list: listMock,
        upload: uploadMock,
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
