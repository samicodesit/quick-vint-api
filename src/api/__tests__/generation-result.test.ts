import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  cors: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { auth: { getUser: mocks.auth }, from: mocks.from },
}));
vi.mock("../../../utils/usageCors", () => ({ runUsageCors: mocks.cors }));
import handler from "../../../api/generation-result";
const requestId = "123e4567-e89b-42d3-a456-426614174000";
let filters: unknown[][];
let row: Record<string, unknown> | null;
let reservation: Record<string, unknown>;
let queryError: unknown;
beforeEach(() => {
  vi.stubEnv("MOBILE_WEB_APP_ENABLED", "true");
  vi.clearAllMocks();
  filters = [];
  queryError = null;
  mocks.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.cors.mockResolvedValue(undefined);
  row = {
    status: "succeeded",
    response_json: { title: "Dress", description: "Details" },
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  reservation = { status: "committed" };
  mocks.from.mockImplementation((table) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((...args) => {
        filters.push(args);
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data: table === "generation_reservations" ? reservation : row,
        error: queryError,
      })),
    };
    return query;
  });
});
async function call(overrides = {}) {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer token" },
      query: { requestId },
      ...overrides,
    } as never,
    res as never,
  );
  return res;
}
it("reads only the authenticated account's operation and never dispatches generation", async () => {
  const res = await call();
  expect(filters).toContainEqual(["user_id", "owner"]);
  expect(filters).toContainEqual(["request_id", requestId]);
  expect(res.json).toHaveBeenCalledWith({
    state: "succeeded",
    result: { title: "Dress", description: "Details" },
  });
  expect(res.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store",
  );
});
it("recovers a committed pending response without reserving or charging", async () => {
  row = {
    ...row,
    status: "in_progress",
    commit_pending: true,
    reservation_id: "reservation",
  };
  expect((await call()).json).toHaveBeenCalledWith({
    state: "succeeded",
    result: { title: "Dress", description: "Details" },
  });
});
it("keeps pending, missing, failed and expired outcomes distinct", async () => {
  row = null;
  expect((await call()).json).toHaveBeenCalledWith({ state: "missing" });
  row = {
    status: "in_progress",
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  expect((await call()).json).toHaveBeenCalledWith({ state: "pending" });
  row.expires_at = new Date(0).toISOString();
  expect((await call()).json).toHaveBeenCalledWith({ state: "expired" });
  row.status = "failed";
  expect((await call()).json).toHaveBeenCalledWith({ state: "failed" });
});
it("fails closed for auth, disabled rollout, invalid IDs and storage outages", async () => {
  expect((await call({ headers: {} })).status).toHaveBeenCalledWith(401);
  expect(
    (await call({ query: { requestId: "invalid" } })).status,
  ).toHaveBeenCalledWith(400);
  queryError = new Error("unavailable");
  expect((await call()).status).toHaveBeenCalledWith(503);
  vi.stubEnv("MOBILE_WEB_APP_ENABLED", "false");
  expect((await call()).status).toHaveBeenCalledWith(404);
});
