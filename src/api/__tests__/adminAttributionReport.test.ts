import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from },
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
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
    "lte",
    "order",
    "in",
    "eq",
    "limit",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

function createRequest(authorization = "Bearer secret") {
  return {
    method: "GET",
    query: { action: "attribution-report", days: "30" },
    headers: { authorization },
  } as any;
}

describe("GET /api/admin?action=attribution-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = "secret";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["tiktok", "x"])(
    "reports %s signup, activation, non-new, and current-paid counts",
    async (source) => {
      from.mockImplementation((table: string) => {
        if (table === "user_attributions") {
          return queryResult({
            data: [
              {
                user_id: "new-user",
                source,
                medium: "organic_social",
                campaign: "profile",
                content: null,
                captured_at: "2026-09-22T08:55:00.000Z",
                claimed_at: "2026-09-22T09:05:00.000Z",
              },
              {
                user_id: "existing-user",
                source,
                medium: "organic_social",
                campaign: "profile",
                content: null,
                captured_at: "2026-09-22T08:55:00.000Z",
                claimed_at: "2026-09-22T09:05:00.000Z",
              },
            ],
            error: null,
          });
        }
        if (table === "profiles") {
          return queryResult({
            data: [
              {
                id: "new-user",
                created_at: "2026-09-22T09:00:00.000Z",
                subscription_status: "active",
                subscription_tier: "starter",
              },
              {
                id: "existing-user",
                created_at: "2026-09-01T09:00:00.000Z",
                subscription_status: "free",
                subscription_tier: "free",
              },
              {
                id: "unknown-user",
                created_at: "2026-09-22T10:00:00.000Z",
                subscription_status: "free",
                subscription_tier: "free",
              },
            ],
            error: null,
          });
        }
        return queryResult({
          data: [
            {
              user_id: "new-user",
              endpoint: "/api/generate",
              request_method: "POST",
              response_status: 200,
              created_at: "2026-09-22T09:10:00.000Z",
            },
          ],
          error: null,
        });
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
      const response = createResponse();
      await handler(createRequest(), response as any);

      expect(response.statusCode).toBe(200);
      expect(response.body.available).toBe(true);
      expect(response.body.tiktok).toMatchObject({
        captured: source === "tiktok" ? 2 : 0,
        newSignups: source === "tiktok" ? 1 : 0,
        activated: source === "tiktok" ? 1 : 0,
        nonNewClaims: source === "tiktok" ? 1 : 0,
        activePaidProfiles: source === "tiktok" ? 1 : 0,
      });
      expect(response.body.cohorts).toEqual([
        expect.objectContaining({
          source,
          campaign: "profile",
          captured: 2,
          newSignups: 1,
          activated: 1,
          nonNewClaims: 1,
          activePaidProfiles: 1,
        }),
      ]);
      expect(response.body.tiktok.paid).toBeUndefined();
      expect(response.body.tiktok.repeat).toBeUndefined();
      expect(response.body.unknown).toEqual({
        profiles: 1,
        crossDeviceUnobservable: true,
      });
      expect(response.body.measurement).toMatchObject({
        userLevel: "authenticated_client_claim",
        platformVerified: false,
        platformProof: "not_connected",
      });
      expect(JSON.stringify(response.body)).not.toContain("@example.com");
    },
  );

  it("returns unavailable when the attribution schema is not installed", async () => {
    from.mockReturnValue(
      queryResult({
        data: null,
        error: {
          code: "PGRST205",
          message:
            "Could not find the table 'public.user_attributions' in the schema cache",
        },
      }),
    );

    const response = createResponse();
    await handler(createRequest(), response as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      available: false,
      status: "unavailable",
      reason: "attribution_schema_unavailable",
    });
    expect(response.body.tiktok).toBeUndefined();
    expect(response.body.message).toContain("not been installed");
  });

  it("keeps the existing admin authentication boundary", async () => {
    const response = createResponse();
    await handler(createRequest("Bearer wrong"), response as any);

    expect(response.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  function dataset(users = 2, logCount = 1001) {
    const profiles = Array.from({ length: users }, (_, i) => ({
      id: `user-${String(i).padStart(5, "0")}`,
      created_at: "2026-09-22T09:00:00.000Z",
      subscription_tier: "free",
      subscription_status: "free",
    }));
    return {
      profiles,
      user_attributions: profiles.map((p) => ({
        user_id: p.id,
        source: "google",
        medium: "search",
        campaign: null,
        captured_at: "2026-09-22T08:55:00.000Z",
        claimed_at: "2026-09-22T09:05:00.000Z",
      })),
      api_logs: Array.from({ length: logCount }, (_, i) => ({
        id: String(i).padStart(6, "0"),
        user_id: profiles[i === logCount - 1 ? users - 1 : 0].id,
        endpoint: "/api/generate",
        request_method: "POST",
        response_status: 200,
        created_at: "2026-09-22T09:10:00.000Z",
      })),
    };
  }

  function mockDatabase(data: ReturnType<typeof dataset>, failLogPage = -1) {
    const reads: Array<{
      table: string;
      start: number;
      end: number;
      ids: number;
      orders: string[];
    }> = [];
    from.mockImplementation((table: keyof typeof data) => {
      let selected = data[table] as any[];
      let start = 0,
        end = 999,
        ids = 0;
      const q: any = {};
      const orders: string[] = [];
      q.select = vi.fn(() => q);
      q.range = vi.fn((a, b) => {
        start = a;
        end = b;
        return q;
      });
      q.order = vi.fn((key, options) => {
        expect(options).toEqual({ ascending: true });
        orders.push(key);
        return q;
      });
      q.eq = vi.fn((key, value) => {
        selected = selected.filter((x) => x[key] === value);
        return q;
      });
      q.in = vi.fn((key, values) => {
        ids = values.length;
        selected = selected.filter((x) => values.includes(x[key]));
        return q;
      });
      q.gte = vi.fn((key, value) => {
        selected = selected.filter((x) => x[key] >= value);
        return q;
      });
      q.lte = vi.fn((key, value) => {
        selected = selected.filter((x) => x[key] <= value);
        return q;
      });
      q.then = (resolve: any, reject: any) => {
        reads.push({ table, start, end, ids, orders });
        return Promise.resolve(
          table === "api_logs" && start === failLogPage
            ? { data: null, error: { message: "page failed" } }
            : {
                data: selected.slice(start, Math.min(end + 1, start + 1000)),
                error: null,
              },
        ).then(resolve, reject);
      };
      return q;
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    return reads;
  }

  it("counts activation beyond the first 1000 matching logs", async () => {
    const reads = mockDatabase(dataset());
    const response = createResponse();
    await handler(createRequest(), response as any);
    expect(response.body.totals.activated).toBe(2);
    expect(response.body.completeness.truncated).toBe(false);
    expect(
      reads.filter((x) => x.table === "api_logs").map((x) => x.start),
    ).toEqual([0, 1000]);
    for (const read of reads) {
      expect(read.orders).toEqual([
        read.table === "user_attributions" ? "user_id" : "id",
      ]);
    }
  });

  it("filters preflights, failures and unrelated events before fetching pages", async () => {
    const data = dataset(2, 1);
    data.api_logs = [
      ...Array.from({ length: 1000 }, (_, i) => ({
        ...data.api_logs[0],
        id: String(i),
        user_id: data.profiles[0].id,
        request_method: "OPTIONS",
      })),
      {
        ...data.api_logs[0],
        user_id: data.profiles[0].id,
        response_status: 500,
      },
      {
        ...data.api_logs[0],
        user_id: data.profiles[0].id,
        endpoint: "/event/generate_click",
      },
      data.api_logs[0],
    ];
    const reads = mockDatabase(data);
    const response = createResponse();
    await handler(createRequest(), response as any);
    expect(response.body.totals.activated).toBe(1);
    expect(response.body.completeness.truncated).toBe(false);
    expect(reads.filter((x) => x.table === "api_logs")).toHaveLength(1);
  });

  it("paginates claims at the server's 1000-row limit and bounds ID batches", async () => {
    const reads = mockDatabase(dataset(1001, 0));
    const response = createResponse();
    await handler(createRequest(), response as any);
    expect(response.body.totals.newSignups).toBe(1001);
    expect(response.body.completeness.truncated).toBe(false);
    expect(reads.every((x) => x.end - x.start < 1000 && x.ids <= 100)).toBe(
      true,
    );
  });

  it("marks capped generation reads incomplete and never reads without a bound", async () => {
    const reads = mockDatabase(dataset(2, 10001));
    const response = createResponse();
    await handler(createRequest(), response as any);
    expect(response.body.completeness.truncated).toBe(true);
    expect(reads.filter((x) => x.table === "api_logs")).toHaveLength(10);
    expect(response.body.completeness.queriesUsed).toBe(reads.length);
    expect(reads.length).toBeLessThanOrEqual(40);
  });

  it("fails the request instead of returning a successful partial report on page error", async () => {
    mockDatabase(dataset(), 1000);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = createResponse();
      await handler(createRequest(), response as any);
      expect(response.statusCode).toBe(500);
    } finally {
      error.mockRestore();
    }
  });

  it("stops all reads at the shared request budget across many account batches", async () => {
    const reads = mockDatabase(dataset(4001, 0));
    const response = createResponse();
    await handler(createRequest(), response as any);
    expect(reads).toHaveLength(40);
    expect(response.body.completeness).toMatchObject({
      truncated: true,
      queriesUsed: 40,
      maxQueries: 40,
    });
  });

  it("does not query generation logs when there are no attribution claims", async () => {
    const reads = mockDatabase(dataset(0, 0));
    const response = createResponse();
    await handler(createRequest(), response as any);
    expect(reads.map((x) => x.table)).toEqual([
      "user_attributions",
      "profiles",
    ]);
    expect(response.body.completeness.truncated).toBe(false);
  });
});
