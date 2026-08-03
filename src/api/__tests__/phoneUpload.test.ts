import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
const uploadMock = vi.fn();
const createSignedUrlMock = vi.fn();
const createSignedUrlsMock = vi.fn();
const downloadMock = vi.fn();
const removeMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        list: listMock,
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
        createSignedUrls: createSignedUrlsMock,
        download: downloadMock,
        remove: removeMock,
      })),
    },
    auth: {
      getUser: getUserMock,
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

function mockV2Session(
  overrides: Partial<{
    status: "open" | "uploading" | "complete" | "cancelled" | "expired";
    expectedCount: number | null;
    expiresAt: string;
  }> = {},
) {
  downloadMock.mockResolvedValue({
    data: new Blob([
      JSON.stringify({
        v: 2,
        ownerId: "user-1",
        mode: "batch",
        source: "phone",
        status: "open",
        expectedCount: null,
        createdAt: "2026-08-02T10:00:00.000Z",
        lastActivityAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        ...overrides,
      }),
    ]),
    error: null,
  });
}

describe("phone upload endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens an authenticated v2 upload session in the existing storage bucket", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    uploadMock.mockResolvedValue({ error: null });

    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer valid-token",
        },
        query: {
          action: "open",
          v: "2",
          sessionId,
          mode: "batch",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      v: 2,
      status: "open",
      sessionId,
    });
    expect(getUserMock).toHaveBeenCalledWith("valid-token");
    expect(uploadMock).toHaveBeenCalledWith(
      `${sessionId}/_session.json`,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/json",
        upsert: false,
      }),
    );
    const marker = JSON.parse(uploadMock.mock.calls[0][1].toString());
    expect(marker).toMatchObject({
      v: 2,
      ownerId: "user-1",
      mode: "batch",
      source: "phone",
      status: "open",
      expectedCount: null,
    });
    expect(
      new Date(marker.expiresAt).getTime() -
        new Date(marker.createdAt).getTime(),
    ).toBe(60 * 60 * 1000);
  });

  it("rejects unauthenticated v2 session creation without affecting v1", async () => {
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "open",
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          mode: "single",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("fixes the v2 expected count on first prepare", async () => {
    mockV2Session();
    uploadMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          v: "2",
          sessionId,
          expectedCount: "3",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      v: 2,
      status: "uploading",
      expectedCount: 3,
    });
    expect(downloadMock).toHaveBeenCalledWith(`${sessionId}/_session.json`);
    const markerWrite = uploadMock.mock.calls.find(
      ([path]) => path === `${sessionId}/_session.json`,
    );
    expect(markerWrite).toBeTruthy();
    expect(JSON.parse(markerWrite![1].toString())).toMatchObject({
      status: "uploading",
      expectedCount: 3,
    });
  });

  it("acquires one uploader lock when a v2 batch is prepared", async () => {
    mockV2Session();
    uploadMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const uploaderId = "11111111-1111-4111-8111-111111111111";

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          v: "2",
          sessionId,
          expectedCount: "3",
          uploaderId,
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(uploadMock).toHaveBeenCalledWith(
      `${sessionId}/_uploader.json`,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/json",
        upsert: false,
      }),
    );
    const lockWrite = uploadMock.mock.calls.find(
      ([path]) => path === `${sessionId}/_uploader.json`,
    );
    expect(JSON.parse(lockWrite![1].toString())).toMatchObject({ uploaderId });
  });

  it("allows the same uploader to retry prepare after acquiring the lock", async () => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const uploaderId = "11111111-1111-4111-8111-111111111111";
    downloadMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: new Blob([
          JSON.stringify(
            path.endsWith("/_uploader.json")
              ? { uploaderId }
              : {
                  v: 2,
                  ownerId: "user-1",
                  mode: "batch",
                  source: "phone",
                  status: "uploading",
                  expectedCount: 3,
                  createdAt: new Date().toISOString(),
                  lastActivityAt: new Date().toISOString(),
                  expiresAt: new Date(
                    Date.now() + 60 * 60 * 1000,
                  ).toISOString(),
                },
          ),
        ]),
        error: null,
      }),
    );
    uploadMock.mockResolvedValueOnce({ error: new Error("already exists") });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          v: "2",
          sessionId,
          expectedCount: "3",
          uploaderId,
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
  });

  it("lets the owning v2 uploader increase the expected count", async () => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const uploaderId = "11111111-1111-4111-8111-111111111111";
    downloadMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: new Blob([
          JSON.stringify(
            path.endsWith("/_uploader.json")
              ? { uploaderId }
              : {
                  v: 2,
                  ownerId: "user-1",
                  mode: "batch",
                  source: "phone",
                  status: "uploading",
                  expectedCount: 2,
                  createdAt: new Date().toISOString(),
                  lastActivityAt: new Date().toISOString(),
                  expiresAt: new Date(
                    Date.now() + 60 * 60 * 1000,
                  ).toISOString(),
                },
          ),
        ]),
        error: null,
      }),
    );
    uploadMock.mockImplementation((path: string) =>
      Promise.resolve({
        error: path.endsWith("/_uploader.json")
          ? new Error("already exists")
          : null,
      }),
    );
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          v: "2",
          sessionId,
          expectedCount: "5",
          uploaderId,
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      status: "uploading",
      expectedCount: 5,
    });
    const markerWrite = uploadMock.mock.calls.find(
      ([path]) => path === `${sessionId}/_session.json`,
    );
    expect(JSON.parse(markerWrite![1].toString())).toMatchObject({
      status: "uploading",
      expectedCount: 5,
    });
    expect(uploadMock).toHaveBeenCalledWith(
      `${sessionId}/_expected-count-5.json`,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/json",
        upsert: true,
      }),
    );
  });

  it("rejects a v2 expected-count decrease", async () => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const uploaderId = "11111111-1111-4111-8111-111111111111";
    downloadMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: new Blob([
          JSON.stringify(
            path.endsWith("/_uploader.json")
              ? { uploaderId }
              : {
                  v: 2,
                  ownerId: "user-1",
                  mode: "batch",
                  source: "phone",
                  status: "uploading",
                  expectedCount: 5,
                  createdAt: new Date().toISOString(),
                  lastActivityAt: new Date().toISOString(),
                  expiresAt: new Date(
                    Date.now() + 60 * 60 * 1000,
                  ).toISOString(),
                },
          ),
        ]),
        error: null,
      }),
    );
    uploadMock.mockImplementation((path: string) =>
      Promise.resolve({
        error: path.endsWith("/_uploader.json")
          ? new Error("already exists")
          : null,
      }),
    );
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          v: "2",
          sessionId,
          expectedCount: "4",
          uploaderId,
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      status: "uploading",
      expectedCount: 5,
    });
    expect(
      uploadMock.mock.calls.some(([path]) => path.endsWith("/_session.json")),
    ).toBe(false);
  });

  it("rejects a different uploader for an already claimed v2 session", async () => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    downloadMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: new Blob([
          JSON.stringify(
            path.endsWith("/_uploader.json")
              ? { uploaderId: "11111111-1111-4111-8111-111111111111" }
              : {
                  v: 2,
                  ownerId: "user-1",
                  mode: "batch",
                  source: "phone",
                  status: "open",
                  expectedCount: null,
                  createdAt: new Date().toISOString(),
                  lastActivityAt: new Date().toISOString(),
                  expiresAt: new Date(
                    Date.now() + 60 * 60 * 1000,
                  ).toISOString(),
                },
          ),
        ]),
        error: null,
      }),
    );
    uploadMock.mockResolvedValueOnce({ error: new Error("already exists") });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "prepare",
          v: "2",
          sessionId,
          expectedCount: "3",
          uploaderId: "22222222-2222-4222-8222-222222222222",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      v: 2,
      error: "This upload is already open in another tab.",
    });
    expect(
      uploadMock.mock.calls.some(([path]) => path.endsWith("/_session.json")),
    ).toBe(false);
  });

  it("rejects v2 completion when stored photos exceed the fixed count", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "000000-upload.jpg" },
        { name: "000001-upload.jpg" },
        { name: "000002-upload.jpg" },
      ],
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
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          expectedCount: "2",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      complete: false,
      count: 3,
      expectedCount: 2,
    });
    expect(uploadMock).not.toHaveBeenCalledWith(
      expect.stringContaining("_batch-complete.json"),
      expect.anything(),
      expect.anything(),
    );
  });

  it("completes a v2 session only at its exact fixed count", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "000000-first.jpg" },
        { name: "000001-second.jpg" },
      ],
      error: null,
    });
    uploadMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "complete",
          v: "2",
          sessionId,
          expectedCount: "2",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      complete: true,
      v: 2,
      status: "complete",
      count: 2,
      expectedCount: 2,
    });
    const sessionWrites = uploadMock.mock.calls.filter(
      ([path]) => path === `${sessionId}/_session.json`,
    );
    expect(sessionWrites).toHaveLength(1);
    expect(JSON.parse(sessionWrites[0][1].toString())).toMatchObject({
      status: "complete",
      expectedCount: 2,
    });
  });

  it("rejects v2 uploads after the session is complete", async () => {
    mockV2Session({ status: "complete", expectedCount: 2 });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const req = createMultipartUploadRequest({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      uploadOrder: 1,
      filename: "late.jpg",
    });
    req.query.v = "2";
    const res = createResponse();

    await handler(req, res as any);
    await res.finished;

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, status: "complete" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("accepts a v2 upload when storage still returns the pre-prepare open marker", async () => {
    mockV2Session({ status: "open", expectedCount: null });
    uploadMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const req = createMultipartUploadRequest({
      sessionId,
      uploadOrder: 38,
      filename: "late-visible-marker.jpg",
    });
    req.query.v = "2";
    const res = createResponse();

    await handler(req, res as any);
    await res.finished;

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      v: 2,
      status: "uploading",
    });
    expect(uploadMock).toHaveBeenCalledWith(
      `${sessionId}/000038-upload.jpg`,
      expect.any(Buffer),
      expect.objectContaining({ upsert: true }),
    );
    expect(
      uploadMock.mock.calls.filter(([path]) => path.endsWith("/_session.json")),
    ).toHaveLength(0);
  });

  it("accepts an appended v2 order when the prepared session read is stale", async () => {
    mockV2Session({ status: "uploading", expectedCount: 27 });
    uploadMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const req = createMultipartUploadRequest({
      sessionId,
      uploadOrder: 28,
      filename: "appended.jpg",
    });
    req.query.v = "2";
    const res = createResponse();

    await handler(req, res as any);
    await res.finished;

    expect(res.statusCode).toBe(200);
    expect(uploadMock).toHaveBeenCalledWith(
      `${sessionId}/000028-upload.jpg`,
      expect.any(Buffer),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("rejects a v2 order outside the request's prepared total", async () => {
    mockV2Session({ status: "uploading", expectedCount: 27 });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const req = createMultipartUploadRequest({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      uploadOrder: 29,
      filename: "outside-total.jpg",
    });
    req.query = { ...req.query, v: "2", expectedCount: "29" };
    const res = createResponse();

    await handler(req, res as any);
    await res.finished;

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid upload order" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("completes a v2 upload when exact files exist but the marker read is stale", async () => {
    mockV2Session({ status: "open", expectedCount: null });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "000000-first.jpg" },
        { name: "000001-second.jpg" },
      ],
      error: null,
    });
    uploadMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: {
          action: "complete",
          v: "2",
          sessionId,
          expectedCount: "2",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    const markerWrite = uploadMock.mock.calls.find(
      ([path]) => path === `${sessionId}/_session.json`,
    );
    expect(JSON.parse(markerWrite![1].toString())).toMatchObject({
      status: "complete",
      expectedCount: 2,
    });
  });

  it("rejects unsupported v2 image types before storage", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const req = createMultipartUploadRequest({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      uploadOrder: 0,
      filename: "vector.svg",
      contentType: "image/svg+xml",
    });
    req.query.v = "2";
    const res = createResponse();

    await handler(req, res as any);
    await res.finished;

    expect(res.statusCode).toBe(415);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects more than one file in a v2 upload request", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const req = createMultipartMultiUploadRequest({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      uploadOrder: 0,
      filenames: ["first.jpg", "second.jpg"],
    });
    req.query.v = "2";
    const res = createResponse();

    await handler(req, res as any);
    await res.finished;

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Upload one photo per request" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("bulk-signs completed v2 photos once", async () => {
    mockV2Session({ status: "complete", expectedCount: 2 });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "000000-upload.jpg" },
        { name: "000001-upload.jpg" },
      ],
      error: null,
    });
    createSignedUrlsMock.mockResolvedValue({
      data: [
        {
          path: "550e8400-e29b-41d4-a716-446655440000/000000-upload.jpg",
          signedUrl: "https://signed.test/photo-0",
          error: null,
        },
        {
          path: "550e8400-e29b-41d4-a716-446655440000/000001-upload.jpg",
          signedUrl: "https://signed.test/photo-1",
          error: null,
        },
      ],
      error: null,
    });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      v: 2,
      status: "complete",
      count: 2,
      expectedCount: 2,
      complete: true,
    });
    expect(res.body.files.map((file: any) => file.url)).toEqual([
      "https://signed.test/photo-0",
      "https://signed.test/photo-1",
    ]);
    expect(createSignedUrlsMock).toHaveBeenCalledWith(
      [
        "550e8400-e29b-41d4-a716-446655440000/000000-upload.jpg",
        "550e8400-e29b-41d4-a716-446655440000/000001-upload.jpg",
      ],
      60 * 60,
    );
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("does not sign incomplete v2 photos", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    listMock.mockResolvedValue({
      data: [{ name: "_session.json" }, { name: "000000-upload.jpg" }],
      error: null,
    });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      v: 2,
      status: "uploading",
      count: 1,
      expectedCount: 2,
      complete: false,
      files: [
        {
          name: "000000-upload.jpg",
          path: "550e8400-e29b-41d4-a716-446655440000/000000-upload.jpg",
          order: 0,
        },
      ],
    });
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("uses the immutable completion marker when the v2 session read is stale", async () => {
    mockV2Session({ status: "uploading", expectedCount: 1 });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "_batch-complete.json" },
        { name: "000000-upload.jpg" },
      ],
      error: null,
    });
    createSignedUrlsMock.mockResolvedValue({
      data: [
        {
          path: "550e8400-e29b-41d4-a716-446655440000/000000-upload.jpg",
          signedUrl: "https://signed.test/photo",
          error: null,
        },
      ],
      error: null,
    });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      v: 2,
      status: "complete",
      complete: true,
      count: 1,
      expectedCount: 1,
    });
  });

  it("returns an active v2 session status before any photos arrive", async () => {
    mockV2Session({ status: "open", expectedCount: null });
    listMock.mockResolvedValue({
      data: [{ name: "_session.json" }],
      error: null,
    });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      v: 2,
      status: "open",
      files: [],
      count: 0,
      expectedCount: null,
      complete: false,
    });
  });

  it("expires a stale v2 session and removes the whole session immediately", async () => {
    mockV2Session({
      status: "uploading",
      expectedCount: 2,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "000000-upload.jpg" },
        { name: "000001-upload.jpg" },
      ],
      error: null,
    });
    removeMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      { method: "GET", headers: {}, query: { v: "2", sessionId } } as any,
      res as any,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({
      v: 2,
      status: "expired",
      complete: false,
    });
    expect(removeMock).toHaveBeenCalledWith([
      `${sessionId}/_session.json`,
      `${sessionId}/000000-upload.jpg`,
      `${sessionId}/000001-upload.jpg`,
    ]);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("cancels a v2 session without retaining its photos", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    listMock.mockResolvedValue({
      data: [{ name: "_session.json" }, { name: "000000-upload.jpg" }],
      error: null,
    });
    removeMock.mockResolvedValue({ error: null });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: { action: "cleanup", v: "2", reason: "cancelled", sessionId },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(removeMock).toHaveBeenCalledWith([
      `${sessionId}/_session.json`,
      `${sessionId}/000000-upload.jpg`,
    ]);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("reports cleanup failure instead of pretending it succeeded", async () => {
    listMock.mockResolvedValue({ data: [{ name: "photo.jpg" }], error: null });
    removeMock.mockResolvedValue({ error: new Error("storage unavailable") });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        query: { action: "cleanup", sessionId: "legacy-session" },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Could not clean up upload session",
    });
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
        { name: "_uploader.json" },
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

  it("uses the immutable wave total when the v2 session read is stale", async () => {
    mockV2Session({ status: "uploading", expectedCount: 2 });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "_expected-count-3.json" },
        { name: "000000-upload.jpg" },
        { name: "000001-upload.jpg" },
        { name: "000002-upload.jpg" },
      ],
      error: null,
    });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      count: 3,
      expectedCount: 3,
      complete: false,
    });
  });

  it("signs only the requested completed v2 wave", async () => {
    mockV2Session({ status: "uploading", expectedCount: 5 });
    listMock.mockResolvedValue({
      data: [
        { name: "_session.json" },
        { name: "000000-upload.jpg" },
        { name: "000001-upload.jpg" },
        { name: "000002-upload.jpg" },
        { name: "000003-upload.jpg" },
        { name: "000004-upload.jpg" },
      ],
      error: null,
    });
    createSignedUrlsMock.mockImplementation((paths: string[]) =>
      Promise.resolve({
        data: paths.map((path) => ({
          path,
          signedUrl: `https://signed.test/${path}`,
        })),
        error: null,
      }),
    );
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          v: "2",
          sessionId,
          includeUrls: "1",
          fromOrder: "2",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: "uploading",
      count: 5,
      expectedCount: 5,
      complete: false,
    });
    expect(res.body.files.map((file: any) => file.order)).toEqual([2, 3, 4]);
    expect(res.body.files.map((file: any) => file.url)).toEqual([
      `https://signed.test/${sessionId}/000002-upload.jpg`,
      `https://signed.test/${sessionId}/000003-upload.jpg`,
      `https://signed.test/${sessionId}/000004-upload.jpg`,
    ]);
  });

  it("returns terminal v2 status without listing files", async () => {
    mockV2Session({ status: "complete", expectedCount: 5 });
    const module = await import("../../../api/phone-upload.js");
    const handler = (module as any).default;
    const res = createResponse();

    await handler(
      {
        method: "GET",
        headers: {},
        query: {
          action: "status",
          v: "2",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      v: 2,
      status: "complete",
      complete: true,
      expectedCount: 5,
    });
    expect(listMock).not.toHaveBeenCalled();
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
