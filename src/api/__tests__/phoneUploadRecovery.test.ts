import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    storage: { from: () => storage },
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
  },
}));
vi.mock("../../../utils/incidents/phone", () => ({
  registerPhoneEvidenceOwner: vi.fn(),
}));
vi.mock("../../../utils/incidents/service", () => ({
  continueIncidentWork: vi.fn(),
}));
vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));
import handler from "../../../api/phone-upload";

const sessionId = "550e8400-e29b-41d4-a716-446655440099";
const marker = () => ({
  v: 2,
  ownerId: "owner",
  mode: "single",
  source: "phone",
  status: "uploading",
  expectedCount: 2,
  createdAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
const gateway = {
  name: "StorageApiError",
  message: "Bad Gateway",
  status: 520,
  statusCode: "DatabaseError",
};
let objects: Map<string, string>;
async function call(action = "complete", options: any = {}) {
  const res: any = {
    statusCode: 200,
    headers: {},
    setHeader(k: string, v: any) {
      this.headers[k] = v;
    },
    getHeader(k: string) {
      return this.headers[k];
    },
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    end() {},
  };
  await handler(
    {
      method: action === "status" ? "GET" : "POST",
      headers: {},
      query: {
        action,
        v: "2",
        sessionId,
        expectedCount: "2",
        ...options.query,
      },
      body: options.body,
    } as any,
    res,
  );
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  objects = new Map([
    [`${sessionId}/_session.json`, JSON.stringify(marker())],
    [`${sessionId}/000000-upload.jpg`, "photo"],
    [`${sessionId}/000001-upload.jpg`, "photo"],
  ]);
  storage.download.mockImplementation(async (path) =>
    objects.has(path)
      ? { data: new Blob([objects.get(path)!]), error: null }
      : {
          data: null,
          error: {
            status: 400,
            statusCode: "404",
            message: "Object not found",
          },
        },
  );
  storage.list.mockImplementation(async () => ({
    data: [...objects.keys()].map((path) => ({ name: path.split("/").at(-1) })),
    error: null,
  }));
  storage.upload.mockImplementation(async (path, data, options) => {
    if (objects.has(path) && !options.upsert)
      return {
        error: {
          status: 409,
          statusCode: "ResourceAlreadyExists",
          message: "Already exists",
        },
      };
    objects.set(path, data.toString());
    return { error: null };
  });
  storage.update.mockImplementation(async (path, data) => {
    if (!objects.has(path))
      return {
        error: {
          status: 404,
          statusCode: "NoSuchKey",
          message: "Object not found",
        },
      };
    objects.set(path, data.toString());
    return { error: null };
  });
  storage.remove.mockImplementation(async (paths) => {
    paths.forEach((path: string) => objects.delete(path));
    return { error: null };
  });
});
describe("phone metadata recovery endpoint", () => {
  it("cannot recreate a session cancelled just before the final marker write", async () => {
    const upload = storage.upload.getMockImplementation()!;
    storage.upload.mockImplementation(async (...args) => {
      if (args[0].endsWith("_session.json")) objects.clear();
      return upload(...args);
    });
    storage.update.mockImplementation(async () => {
      objects.clear();
      return {
        error: {
          status: 404,
          statusCode: "NoSuchKey",
          message: "Object not found",
        },
      };
    });
    expect((await call()).statusCode).toBe(410);
    expect(objects.has(`${sessionId}/_session.json`)).toBe(false);
  });
  it("keeps pre-multipart and list read failures in the service-error path", async () => {
    storage.download.mockResolvedValue({ data: null, error: gateway });
    const res: any = {
      setHeader() {},
      getHeader() {},
      status(n: number) {
        this.statusCode = n;
        return this;
      },
      json(body: any) {
        this.body = body;
        return this;
      },
    };
    await handler(
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=test" },
        query: { v: "2", sessionId },
      } as any,
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.body.retryable).toBe(true);
    expect((await call("list")).statusCode).toBe(400);
    await handler(
      { method: "GET", headers: {}, query: { v: "2", sessionId } } as any,
      res,
    );
    expect(res.statusCode).toBe(503);
  });
  it.each(["unavailable", "corrupt"])(
    "reports an %s uploader marker instead of assuming ownership",
    async (kind) => {
      const originalDownload = storage.download.getMockImplementation()!;
      storage.download.mockImplementation(async (path) =>
        path.endsWith("_uploader.json")
          ? kind === "unavailable"
            ? { data: null, error: gateway }
            : { data: new Blob(['{"uploaderId":null}']), error: null }
          : originalDownload(path),
      );
      const originalUpload = storage.upload.getMockImplementation()!;
      storage.upload.mockImplementation(async (...args) =>
        args[0].endsWith("_uploader.json")
          ? { error: { status: 409, statusCode: "ResourceAlreadyExists" } }
          : originalUpload(...args),
      );
      const res = await call("prepare", {
        query: { uploaderId: "11111111-1111-4111-8111-111111111111" },
      });
      expect(res.statusCode).toBe(kind === "unavailable" ? 503 : 500);
      expect(res.body.retryable).toBe(kind === "unavailable");
    },
  );
  it("does not read an uploader after an outage creating the lock", async () => {
    storage.upload.mockResolvedValue({ error: gateway });
    expect(
      (
        await call("prepare", {
          query: { uploaderId: "11111111-1111-4111-8111-111111111111" },
        })
      ).statusCode,
    ).toBe(503);
    expect(storage.download.mock.calls).toHaveLength(1);
  });
  it("gives cancellation precedence when it arrives between completion writes", async () => {
    const upload = storage.upload.getMockImplementation()!;
    storage.upload.mockImplementation(async (...args) => {
      const result = await upload(...args);
      if (args[0].endsWith("_batch-complete.json"))
        objects.set(
          `${sessionId}/_session.json`,
          JSON.stringify({ ...marker(), status: "cancelled" }),
        );
      return result;
    });
    expect((await call()).statusCode).toBe(410);
    expect(JSON.parse(objects.get(`${sessionId}/_session.json`)!).status).toBe(
      "cancelled",
    );
  });
  it("also makes legacy confirmation idempotent after a lost response", async () => {
    const first = await call("complete", { query: { v: "1" } });
    const manifest = objects.get(`${sessionId}/_batch-complete.json`);
    const repeat = await call("complete", { query: { v: "1" } });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.body).toEqual(first.body);
    expect(objects.get(`${sessionId}/_batch-complete.json`)).toBe(manifest);
  });
  it("keeps healthy metadata at the original storage-call counts", async () => {
    expect((await call("prepare")).statusCode).toBe(200);
    expect(
      storage.download.mock.calls.length + storage.upload.mock.calls.length,
    ).toBe(2);
    storage.download.mockClear();
    storage.upload.mockClear();
    storage.update.mockClear();
    storage.list.mockClear();
    expect((await call()).statusCode).toBe(200);
    expect(
      storage.download.mock.calls.length +
        storage.upload.mock.calls.length +
        storage.update.mock.calls.length +
        storage.list.mock.calls.length,
    ).toBe(6);
  });
  it.each(["status", "prepare", "complete"])(
    "keeps temporary %s reads distinct from expiry",
    async (action) => {
      storage.download.mockResolvedValue({ data: null, error: gateway });
      const res = await call(action, {
        query: { uploaderId: "11111111-1111-4111-8111-111111111111" },
      });
      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({
        code: "DatabaseError",
        retryable: true,
      });
    },
  );
  it.each([
    { status: 404, statusCode: "NoSuchKey" },
    { status: 400, statusCode: "404", message: "Object not found" },
  ])("retains confirmed missing-object expiry", async (error) => {
    storage.download.mockResolvedValue({ data: null, error });
    expect((await call("status")).statusCode).toBe(410);
  });
  it.each(["{broken", JSON.stringify({ v: 2, expiresAt: "invalid" })])(
    "reports corrupt session markers as internal errors",
    async (data) => {
      storage.download.mockResolvedValue({
        data: new Blob([data]),
        error: null,
      });
      const res = await call("status");
      expect(res.statusCode).toBe(500);
      expect(res.body.retryable).toBe(false);
    },
  );
  it("does not describe a permissions failure as expiry", async () => {
    storage.download.mockResolvedValue({
      data: null,
      error: { status: 403, statusCode: "AccessDenied", message: "Forbidden" },
    });
    const res = await call("status");
    expect(res.statusCode).toBe(500);
    expect(res.body.retryable).toBe(false);
  });
  it("makes repeated confirmation immutable and avoids a normal-path manifest read", async () => {
    const first = await call();
    const session = objects.get(`${sessionId}/_session.json`);
    const manifest = objects.get(`${sessionId}/_batch-complete.json`);
    expect(first.statusCode).toBe(200);
    expect(
      storage.download.mock.calls.filter(([path]) =>
        path.endsWith("_batch-complete.json"),
      ),
    ).toHaveLength(0);
    const writes = storage.upload.mock.calls.length;
    const updates = storage.update.mock.calls.length;
    const repeat = await call();
    expect(repeat.statusCode).toBe(200);
    expect(repeat.body).toEqual(first.body);
    expect(objects.get(`${sessionId}/_session.json`)).toBe(session);
    expect(objects.get(`${sessionId}/_batch-complete.json`)).toBe(manifest);
    expect(storage.upload.mock.calls).toHaveLength(writes);
    expect(storage.update.mock.calls).toHaveLength(updates);
  });
  it("recovers a manifest committed before the session update failed", async () => {
    const update = storage.update.getMockImplementation()!;
    let fail = true;
    storage.update.mockImplementation(async (...args) => {
      if (args[0].endsWith("_session.json") && fail) {
        fail = false;
        return { error: gateway };
      }
      return update(...args);
    });
    expect((await call()).statusCode).toBe(503);
    const manifest = JSON.parse(
      objects.get(`${sessionId}/_batch-complete.json`)!,
    );
    expect((await call()).statusCode).toBe(200);
    const completed = JSON.parse(objects.get(`${sessionId}/_session.json`)!);
    expect(completed.lastActivityAt).toBe(manifest.completedAt);
    expect(Date.parse(completed.expiresAt)).toBe(
      Date.parse(manifest.completedAt) + 21600000,
    );
  });
  it("allows concurrent identical confirmations to share the first manifest", async () => {
    const results = await Promise.all([call(), call()]);
    expect(results.map((res) => res.statusCode)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
  });
  it("rejects changed counts or orders, including after completion", async () => {
    expect((await call()).statusCode).toBe(200);
    expect(
      (await call("complete", { query: { expectedCount: "3" } })).statusCode,
    ).toBe(409);
    expect(
      (await call("complete", { body: { expectedCount: 2, orders: [1, 2] } }))
        .statusCode,
    ).toBe(409);
  });
  it("does not recover a cancelled or expired session", async () => {
    await call();
    objects.set(
      `${sessionId}/_session.json`,
      JSON.stringify({ ...marker(), status: "cancelled" }),
    );
    expect((await call()).statusCode).toBe(410);
    objects.set(
      `${sessionId}/_session.json`,
      JSON.stringify({ ...marker(), expiresAt: "2020-01-01T00:00:00Z" }),
    );
    expect((await call()).statusCode).toBe(410);
  });
  it("reserves creation conflict for an actual conflict", async () => {
    const options = { query: { mode: "single" } };
    // Authentication is required by the production endpoint.
    const res: any = {
      setHeader() {},
      getHeader() {},
      status(n: number) {
        this.statusCode = n;
        return this;
      },
      json(body: any) {
        this.body = body;
        return this;
      },
    };
    const req: any = {
      method: "POST",
      headers: { authorization: "Bearer test" },
      query: { action: "open", v: "2", sessionId, ...options.query },
    };
    storage.upload.mockResolvedValueOnce({ error: gateway });
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    await handler(req, res);
    expect(res.statusCode).toBe(409);
  });
});
