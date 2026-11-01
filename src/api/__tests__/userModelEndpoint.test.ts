import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  get: vi.fn(),
  mutate: vi.fn(),
  create: vi.fn(),
  process: vi.fn(),
  wait: vi.fn(),
  profile: vi.fn(),
  pause: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }),
    }),
  },
}));
vi.mock("../../../utils/userModels", () => ({
  getUserModel: mocks.get,
  modelMutate: mocks.mutate,
  createUserModel: mocks.create,
  processUserModel: mocks.process,
  UserModelError: class extends Error {},
}));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.wait }));
vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount: mocks.pause,
}));
vi.mock("../../../utils/disposableDomains", () => ({
  isDisposableEmail: () => false,
}));
vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: { extractRequestMetadata: () => ({ ipAddress: "1.2.3.4" }) },
}));
import handler from "../../../api/user/model";
const prefs = {
  gender: "female",
  hair: "brown",
  heightCm: 170,
  build: "average",
  skinTone: "tone_3",
};
function response() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader: (k: string, v: string) => {
      res.headers[k] = v;
    },
    status: (n: number) => {
      res.statusCode = n;
      return res;
    },
    json: (body: any) => {
      res.body = body;
      return res;
    },
    end: () => res,
  };
  return res;
}
async function call(
  method = "GET",
  body?: object,
  headers: object = { authorization: "Bearer valid" },
) {
  const res = response();
  await handler({ method, body, headers, query: {} } as any, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_MODELS_ENABLED = "true";
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "owner", email: "owner@example.com" } },
    error: null,
  });
  mocks.get.mockResolvedValue({
    invitationState: "unseen",
    enabled: false,
    model: null,
  });
  mocks.process.mockResolvedValue(undefined);
  mocks.profile.mockResolvedValue({
    data: { id: "owner", account_status: "active" },
    error: null,
  });
  mocks.pause.mockResolvedValue({ paused: false });
});
describe("account-owned model endpoint", () => {
  it("requires auth and rejects supplied owners before mutation", async () => {
    expect((await call("GET", undefined, {})).statusCode).toBe(401);
    expect(
      (
        await call("POST", {
          action: "create",
          userId: "other",
          preferences: prefs,
        })
      ).statusCode,
    ).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith("owner");
    expect(res.headers["Cache-Control"]).toContain("no-store");
  });
  it("validates CORS, preferences and mutable fields", async () => {
    expect(
      (
        await call("GET", undefined, {
          origin: "https://evil.test",
          authorization: "Bearer valid",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call("POST", {
          action: "create",
          preferences: { ...prefs, heightCm: 0 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call("PATCH", { enabled: true, preferences: prefs })).statusCode,
    ).toBe(400);
    expect((await call("PATCH", { enabled: "true" })).statusCode).toBe(400);
  });
  it("starts background work with 202 and never takes listing credits", async () => {
    mocks.create.mockResolvedValue({ operation_id: "op", state: "queued" });
    mocks.get.mockResolvedValue({
      model: { operationId: "op", state: "queued" },
    });
    expect(
      (await call("POST", { action: "create", preferences: prefs })).statusCode,
    ).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith("owner", prefs);
    expect(mocks.process).toHaveBeenCalledWith("owner", "op");
    expect(mocks.wait).toHaveBeenCalledOnce();
  });
  it("blocks paused creation and keeps toggles separate from image creation", async () => {
    mocks.pause.mockResolvedValue({ paused: true });
    expect(
      (await call("POST", { action: "create", preferences: prefs })).statusCode,
    ).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect((await call("PATCH", { enabled: false })).statusCode).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith("owner", "enable", {
      enabled: false,
    });
  });
});
