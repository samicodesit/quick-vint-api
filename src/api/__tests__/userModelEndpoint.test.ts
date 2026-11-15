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
  capacity: vi.fn(),
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
vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: { getGenerationCapacity: mocks.capacity },
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
  mocks.create.mockReset();
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
  mocks.capacity.mockResolvedValue({ allowed: true, available: 5 });
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

it.each([
  "https://autolister.app",
  "https://www.vinted.nl",
  "chrome-extension://" + "a".repeat(32),
])("blocks model setup before any work for %s", async (origin) => {
  mocks.pause.mockResolvedValue({
    paused: true,
    reason: "duplicate_ip_signup",
  });
  mocks.get.mockResolvedValue({
    model: { operationId: "op", state: "queued" },
  });
  for (const [method, body] of [
    ["GET", undefined],
    ["PATCH", { enabled: true }],
    ["POST", { action: "invite" }],
  ] as const) {
    const res = await call(method, body, {
      origin,
      authorization: "Bearer valid",
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: "account_paused",
      abuseReason: "duplicate_ip_signup",
    });
  }
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.process).not.toHaveBeenCalled();
});
it("does not resume queued work when disabling or dismissing", async () => {
  mocks.get.mockResolvedValue({
    model: { operationId: "op", state: "queued" },
  });
  await call("PATCH", { enabled: false });
  await call("POST", { action: "dismiss" });
  expect(mocks.process).not.toHaveBeenCalled();
});
it("blocks already paused and missing accounts before reading models", async () => {
  for (const data of [{ id: "owner", account_status: "paused" }, null]) {
    mocks.profile.mockResolvedValue({ data, error: null });
    expect((await call()).statusCode).toBe(403);
  }
  expect(mocks.get).not.toHaveBeenCalled();
});

it.each(["create", "retry"])(
  "blocks %s before provider work when shared allowance is exhausted",
  async (action) => {
    mocks.capacity.mockResolvedValue({
      allowed: false,
      available: 0,
      reason: "free_lifetime_limit",
      message: "Free listing limit reached.",
    });
    const res = await call("POST", {
      action,
      ...(action === "create" ? { preferences: prefs } : {}),
    });
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe("free_lifetime_limit");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  },
);
it("does not check generation capacity for reading or dismissing a model", async () => {
  expect((await call()).statusCode).toBe(200);
  expect((await call("POST", { action: "dismiss" })).statusCode).toBe(200);
  expect(mocks.capacity).not.toHaveBeenCalled();
});
it("allows model creation when the capacity check includes available paid credits", async () => {
  mocks.profile.mockResolvedValue({
    data: {
      id: "owner",
      account_status: "active",
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 0,
      free_lifetime_generations_used: 5,
      pack_credits: 20,
    },
    error: null,
  });
  mocks.capacity.mockResolvedValue({ allowed: true, available: 20 });
  const res = await call("POST", { action: "create", preferences: prefs });
  expect(res.statusCode).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith("owner", prefs);
  expect(mocks.capacity.mock.calls[0][1].pack_credits).toBe(20);
});
it("does not start model creation when capacity checking fails", async () => {
  mocks.capacity.mockRejectedValue(new Error("database unavailable"));
  const res = await call("POST", { action: "create", preferences: prefs });
  expect(res.statusCode).toBe(503);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.process).not.toHaveBeenCalled();
});
