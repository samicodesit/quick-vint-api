import { beforeEach, describe, expect, it, vi } from "vitest";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { from } }));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {};
  }),
}));
import handler from "../../../api/admin/index";
const now = new Date("2026-10-12T12:00:00Z");
const event = (
  id: string,
  name: string,
  user: string | null,
  day: string,
  context: any = {},
) => ({
  id,
  endpoint: `/event/${name}`,
  user_id: user,
  created_at: `${day}T10:00:00Z`,
  response_status: 204,
  full_request_body: {
    event: name,
    source: "mobile_web",
    transportEventId: id,
    context,
  },
});
function query(data: any[], error: any = null) {
  const q: any = {};
  for (const method of ["select", "gte", "lte", "order", "or", "in"])
    q[method] = vi.fn(() => q);
  q.range = vi.fn((start, end) => {
    q.start = start;
    q.end = end;
    return q;
  });
  q.then = (resolve: any, reject: any) =>
    Promise.resolve({
      data: data.slice(q.start || 0, (q.end ?? data.length) + 1),
      error,
    }).then(resolve, reject);
  return q;
}
const res = () => {
  const r: any = {
    statusCode: 200,
    status: vi.fn((s) => {
      r.statusCode = s;
      return r;
    }),
    json: vi.fn((b) => {
      r.body = b;
      return r;
    }),
  };
  return r;
};
async function request(auth = "Bearer secret") {
  const r = res();
  await handler(
    {
      method: "GET",
      headers: { authorization: auth },
      query: { action: "web-app-stats", days: "7" },
    } as any,
    r,
  );
  return r;
}
describe("web app admin endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    process.env.ADMIN_SECRET = "secret";
  });
  it("requires admin auth before querying", async () => {
    expect((await request("Bearer wrong")).statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("separates sessions, new signups, retries, copies and returning generators", async () => {
    const logs = [
      event("v1", "web_app_view", null, "2026-10-10", {
        webSessionId: "s1",
        analyticsClientId: "c1",
        source: "home_hero",
      }),
      event("v2", "web_app_view", null, "2026-10-10", {
        webSessionId: "s1",
        analyticsClientId: "c1",
      }),
      {
        ...event("a1", "auth_complete", "new", "2026-10-10", {
          analyticsClientId: "c1",
        }),
        created_at: "2026-10-10T10:10:00Z",
      },
      event("a2", "auth_complete", "old", "2026-10-10", {
        analyticsClientId: "c2",
      }),
      event("copy1", "copy", "new", "2026-10-10", { field: "title" }),
      event("checkout1", "checkout_start", "new", "2026-10-10", {
        tier: "starter",
      }),
      event("copy1", "copy", "new", "2026-10-10", { field: "title" }),
      {
        id: "g1",
        user_id: "new",
        endpoint: "/api/generate",
        created_at: "2026-10-10T11:00:00Z",
        response_status: 200,
        full_request_body: { client: "mobile_web", requestId: "r1" },
      },
      {
        id: "g2",
        user_id: "new",
        endpoint: "/api/generate",
        created_at: "2026-10-11T11:00:00Z",
        response_status: 200,
        full_request_body: { client: "mobile_web", requestId: "r2" },
      },
      {
        id: "retry",
        user_id: "new",
        endpoint: "/api/generate",
        created_at: "2026-10-11T11:01:00Z",
        response_status: 200,
        full_request_body: { client: "mobile_web", requestId: "r2" },
      },
      {
        id: "ext",
        user_id: "old",
        endpoint: "/api/generate",
        created_at: "2026-10-11T11:00:00Z",
        response_status: 200,
        full_request_body: {},
      },
      event("internal", "auth_complete", "internal", "2026-10-10"),
      event("false", "generation_success", "old", "2026-10-10"),
    ];
    from.mockImplementation((table) =>
      query(
        table === "api_logs"
          ? logs
          : [
              {
                id: "new",
                created_at: "2026-10-10T10:05:00Z",
                subscription_status: "active",
                subscription_tier: "starter",
              },
              {
                id: "old",
                created_at: "2026-01-01T00:00:00Z",
                subscription_status: "free",
                subscription_tier: "free",
              },
              { id: "internal", email: "samicodesit@gmail.com" },
            ],
      ),
    );
    const response = await request();
    expect(response.statusCode).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.totals).toMatchObject({
      visits: 1,
      signedInUsers: 2,
      newSignups: 1,
      activatedUsers: 1,
      generations: 2,
      copies: 1,
      returningGenerators: 1,
      currentPaidUsers: 1,
      checkoutStarts: 1,
    });
    expect(
      response.body.daily.reduce((n: number, d: any) => n + d.generations, 0),
    ).toBe(2);
  });
  it("reports unavailable rather than fabricated zeroes on database failure", async () => {
    from.mockImplementation(() => query([], { message: "unavailable" }));
    const r = await request();
    expect(r.statusCode).toBe(503);
    expect(r.body.available).toBe(false);
    expect(r.body.totals).toBeUndefined();
  });
  it("counts committed results recovered after response loss once on the operation day", async () => {
    const logs = [
      {
        id: "pending",
        user_id: "user",
        endpoint: "/api/generate",
        created_at: "2026-10-10T11:00:00.000Z",
        response_status: 503,
        full_request_body: {
          client: "mobile_web",
          requestId: "r",
          generationCommitted: true,
          generationStartedAt: "2026-10-10T10:59:00.000Z",
        },
      },
      {
        id: "recovered",
        user_id: "user",
        endpoint: "/api/generation-result",
        created_at: "2026-10-11T11:00:00.000Z",
        response_status: 200,
        full_request_body: {
          client: "mobile_web",
          requestId: "r",
          generationCommitted: true,
          generationStartedAt: "2026-10-10T10:59:00.000Z",
        },
      },
    ];
    from.mockImplementation((table) => query(table === "api_logs" ? logs : []));
    const r = await request();
    expect(r.body.totals).toMatchObject({
      generations: 1,
      activatedUsers: 1,
      returningGenerators: 0,
      failedGenerations: 0,
    });
    expect(
      r.body.daily.find((d: any) => d.date === "2026-10-10").generations,
    ).toBe(1);
    expect(
      r.body.daily.find((d: any) => d.date === "2026-10-11").generations,
    ).toBe(0);
  });
  it("places delayed browser events on their occurrence day rather than receipt day", async () => {
    const copy = event("delayed", "copy", "user", "2026-10-12", {
      field: "title",
    });
    const delayed = {
      ...copy,
      full_request_body: {
        ...copy.full_request_body,
        occurredAt: "2026-10-10T11:00:00.000Z",
      },
    };
    from.mockImplementation((table) =>
      query(table === "api_logs" ? [delayed] : []),
    );
    const r = await request();
    expect(r.body.daily.find((d: any) => d.date === "2026-10-10").copies).toBe(
      1,
    );
    expect(r.body.daily.find((d: any) => d.date === "2026-10-12").copies).toBe(
      0,
    );
  });
});
