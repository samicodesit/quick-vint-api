import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, attributionQueries } = vi.hoisted(() => ({
  from: vi.fn(),
  attributionQueries: [] as any[],
}));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { from } }));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {};
  }),
}));
import handler from "../../../api/admin/index";

function queryResult(result: unknown) {
  const query: any = {};
  for (const method of [
    "select",
    "range",
    "gte",
    "lt",
    "order",
    "in",
    "eq",
    "limit",
    "or",
    "not",
    "neq",
  ])
    query[method] = vi.fn(() => query);
  query.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function response() {
  const res = {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
  return res;
}

const users = ["known", "referral", "campaign", "missing"].map((id) => ({
  id,
  email: null,
  created_at: "2026-10-01T10:00:00Z",
  subscription_tier: "free",
  api_calls_this_month: 5,
}));
function stubDatabase(attributions: unknown) {
  from.mockImplementation((table: string) => {
    if (table === "profiles")
      return queryResult({ data: users, count: 4, error: null });
    if (table === "user_attributions") {
      const query = queryResult(attributions);
      attributionQueries.push(query);
      return query;
    }
    if (table === "api_logs")
      return queryResult({
        data: users.map((u) => ({
          user_id: u.id,
          created_at: "2026-10-01T11:00:00Z",
        })),
        error: null,
      });
    return queryResult({ data: [], error: null });
  });
}

describe("admin user channel badges data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attributionQueries.length = 0;
    process.env.ADMIN_SECRET = "secret";
  });

  it.each(["recent", "active", "at-risk"])(
    "joins saved evidence by user id for %s users",
    async (segment) => {
      stubDatabase({
        data: [
          { user_id: "campaign", source: "newsletter", referrer_host: null },
          { user_id: "known", source: "x", referrer_host: "t.co" },
          {
            user_id: "referral",
            source: "unknown",
            referrer_host: "seller-forum.example",
          },
        ],
        error: null,
      });
      const res = response();
      await handler(
        {
          method: "GET",
          headers: { authorization: "Bearer secret" },
          query: { action: "list-users", segment },
        } as any,
        res as any,
      );
      expect(res.statusCode).toBe(200);
      expect(
        res.body.users.map((u: any) => [
          u.id,
          u.acquisition_source,
          u.acquisition_referrer_host,
        ]),
      ).toEqual([
        ["known", "x", "t.co"],
        ["referral", "unknown", "seller-forum.example"],
        ["campaign", "newsletter", null],
        ["missing", null, null],
      ]);
      expect(attributionQueries[0].in).toHaveBeenCalledWith("user_id", [
        "known",
        "referral",
        "campaign",
        "missing",
      ]);
    },
  );

  it("keeps Users available when attribution cannot be read", async () => {
    stubDatabase({
      data: null,
      error: { code: "PGRST205", message: "attribution unavailable" },
    });
    const res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer secret" },
        query: { action: "list-users" },
      } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.users).toHaveLength(4);
    expect(res.body.users[0]).toMatchObject({
      acquisition_source: null,
      acquisition_referrer_host: null,
      acquisition_status: "unavailable",
    });
  });

  it("requires admin authentication before reading channel evidence", async () => {
    const res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer wrong" },
        query: { action: "list-users" },
      } as any,
      res as any,
    );
    expect(res.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
