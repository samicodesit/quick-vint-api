import { beforeEach, describe, expect, it, vi } from "vitest";
const { getUser, action } = vi.hoisted(() => ({
  getUser: vi.fn(),
  action: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { auth: { getUser } },
}));
vi.mock("../../../utils/listingDrafts", () => ({
  handleDraftAction: action,
  DraftError: class extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));
import handler from "../../../api/drafts";
function response() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader: (k: string, v: any) => {
      res.headers[k] = v;
    },
    status: (s: number) => {
      res.statusCode = s;
      return res;
    },
    json: (v: any) => {
      res.body = v;
      return res;
    },
    end: () => res,
  };
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOBILE_WEB_APP_ENABLED = "true";
  process.env.LISTING_DRAFTS_ENABLED = "true";
  getUser.mockResolvedValue({
    data: { user: { id: "123e4567-e89b-42d3-a456-426614174000" } },
    error: null,
  });
  action.mockResolvedValue({ drafts: [] });
});
describe("draft action endpoint", () => {
  it("requires validated bearer ownership and never accepts a supplied owner", async () => {
    const res = response();
    await handler(
      { method: "GET", headers: {}, query: { action: "list" } } as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(action).not.toHaveBeenCalled();
    const authorized = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { action: "list" },
      } as any,
      authorized,
    );
    expect(action).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      "list",
      {},
    );
    expect(authorized.headers["Cache-Control"]).toContain("no-store");
    const forged = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        query: {},
        body: { action: "create", input: { userId: "foreign" } },
      } as any,
      forged,
    );
    expect(forged.statusCode).toBe(400);
  });
  it("fails closed when disabled and rejects internal transition actions", async () => {
    process.env.LISTING_DRAFTS_ENABLED = "false";
    const off = response();
    await handler(
      { method: "GET", headers: {}, query: { action: "list" } } as any,
      off,
    );
    expect(off.statusCode).toBe(404);
    process.env.LISTING_DRAFTS_ENABLED = "true";
    const internal = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: { action: "complete", input: {} },
      } as any,
      internal,
    );
    expect(internal.statusCode).toBe(400);
  });
  it("rejects unapproved origins and GET mutations before calling the repository", async () => {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          authorization: "Bearer valid",
        },
        body: { action: "create", input: {} },
      } as any,
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(action).not.toHaveBeenCalled();
    const mutation = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { action: "delete" },
      } as any,
      mutation,
    );
    expect(mutation.statusCode).toBe(405);
  });
});
