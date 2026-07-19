import { Readable } from "node:stream";
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
  let resolveFinished: (() => void) | null = null;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const response = {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, unknown>,
    finished,
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
      resolveFinished?.();
      return response;
    }),
  };
  return response;
}

function createMultipartUploadRequest({
  sessionId,
  uploadOrder,
  filename,
  contentType = "image/jpeg",
  body = "photo-bytes",
}: {
  sessionId: string;
  uploadOrder: number;
  filename: string;
  contentType?: string;
  body?: string;
}) {
  const boundary = "----autolister-test-boundary";
  const payload = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="sessionId"',
      "",
      sessionId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="uploadOrder"',
      "",
      String(uploadOrder),
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      "",
      body,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
  const req = Readable.from(payload) as any;
  req.method = "POST";
  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(payload.length),
  };
  req.query = { sessionId };
  return req;
}

function createMultipartMultiUploadRequest({
  sessionId,
  uploadOrder,
  filenames,
  contentType = "image/jpeg",
}: {
  sessionId: string;
  uploadOrder: number;
  filenames: string[];
  contentType?: string;
}) {
  const boundary = "----autolister-test-boundary";
  const parts = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="sessionId"',
    "",
    sessionId,
    `--${boundary}`,
    'Content-Disposition: form-data; name="uploadOrder"',
    "",
    String(uploadOrder),
  ];
  filenames.forEach((filename, index) => {
    parts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      "",
      `photo-bytes-${index + 1}`,
    );
  });
  parts.push(`--${boundary}--`, "");

  const payload = Buffer.from(parts.join("\r\n"));
  const req = Readable.from(payload) as any;
  req.method = "POST";
  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(payload.length),
  };
  req.query = { sessionId };
  return req;
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

  it("completes batches with more than one storage page of files", async () => {
    const files = Array.from({ length: 224 }, (_, index) => ({
      name: `${String(index).padStart(6, "0")}-upload.jpg`,
    }));
    listMock.mockImplementation(
      (_sessionId: string, options: { offset?: number; limit?: number }) => {
        const offset = options?.offset || 0;
        const limit = options?.limit || 100;
        return Promise.resolve({
          data: files.slice(offset, offset + limit),
          error: null,
        });
      },
    );
    uploadMock.mockResolvedValue({ error: null });

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
          expectedCount: "224",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      complete: true,
      count: 224,
      expectedCount: 224,
    });
    expect(res.body.files).toHaveLength(224);
    expect(uploadMock).toHaveBeenCalledWith(
      "sess-test/_batch-complete.json",
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/json",
        upsert: true,
      }),
    );
  });

  it("stores repeated uploads for the same session order at one idempotent path", async () => {
    uploadMock.mockResolvedValue({ error: null });

    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;

    for (const filename of ["first.jpg", "second.jpg"]) {
      const res = createResponse();
      await handler(
        createMultipartUploadRequest({
          sessionId: "sess-test",
          uploadOrder: 2,
          filename,
        }),
        res as any,
      );
      await res.finished;
      expect(res.statusCode).toBe(200);
    }

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls.map((call) => call[0])).toEqual([
      "sess-test/000002-upload.jpg",
      "sess-test/000002-upload.jpg",
    ]);
    expect(uploadMock.mock.calls.map((call) => call[2])).toEqual([
      expect.objectContaining({
        contentType: "image/jpeg",
        upsert: true,
      }),
      expect.objectContaining({
        contentType: "image/jpeg",
        upsert: true,
      }),
    ]);
  });

  it("keeps multiple files in one multipart request distinct from the base order", async () => {
    uploadMock.mockResolvedValue({ error: null });

    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      createMultipartMultiUploadRequest({
        sessionId: "sess-test",
        uploadOrder: 5,
        filenames: ["first.jpg", "second.jpg"],
      }),
      res as any,
    );
    await res.finished;

    expect(res.statusCode).toBe(200);
    expect(uploadMock.mock.calls.map((call) => call[0])).toEqual([
      "sess-test/000005-upload.jpg",
      "sess-test/000006-upload.jpg",
    ]);
    expect(res.body.files.map((file: any) => file.order)).toEqual([5, 6]);
  });
});
