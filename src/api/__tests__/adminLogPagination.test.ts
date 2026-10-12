import { describe, expect, it, vi } from "vitest";

const { selections, query, profileQuery } = vi.hoisted(() => {
  const selections: any[] = [];
  const query: any = {};
  for (const method of [
    "order",
    "range",
    "eq",
    "gte",
    "lte",
    "or",
    "like",
    "neq",
    "not",
  ])
    query[method] = vi.fn(() => query);
  query.select = vi.fn((_columns, options) => {
    selections.push(options);
    query.result = options?.head
      ? { count: options.count === "exact" ? 127 : 1, error: null }
      : {
          data: Array.from({ length: 51 }, (_, i) => ({
            id: `log-${i}`,
            endpoint: "/event/telemetry_queue_dropped",
            ...(i === 0
              ? {
                  openai_model: "gpt-6.1-sol",
                  openai_prompt_tokens: 1000,
                  openai_completion_tokens: 200,
                  openai_billing: { serviceTier: "fast", cacheWriteTokens: 0 },
                }
              : {}),
          })),
          error: null,
        };
    return query;
  });
  query.then = (resolve: any) => Promise.resolve(query.result).then(resolve);
  query.range.mockImplementation((start: number, end: number) => {
    if (query.result?.data)
      query.result.data = query.result.data.slice(0, end - start + 1);
    return query;
  });
  const profileQuery: any = {};
  for (const method of ["select", "eq", "ilike", "limit"])
    profileQuery[method] = vi.fn(() => profileQuery);
  profileQuery.maybeSingle = vi.fn(async () => ({
    data: { id: "550e8400-e29b-41d4-a716-446655440000" },
    error: null,
  }));
  return { selections, query, profileQuery };
});
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table) => (table === "profiles" ? profileQuery : query)),
  },
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {};
  }),
}));
import handler from "../../../api/admin/index.js";

describe("admin log pagination", () => {
  it("keeps later forensic records reachable when a planned count underestimates the result", async () => {
    process.env.ADMIN_SECRET = "secret";
    selections.length = 0;
    const res: any = {
      body: null,
      status() {
        return this;
      },
      json(body: any) {
        this.body = body;
        return this;
      },
    };
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer secret" },
        query: {
          action: "view-logs",
          log_type: "all",
          page: "1",
          limit: "50",
        },
      } as any,
      res,
    );
    expect(res.body.logs).toHaveLength(50);
    expect(res.body.logs[0].openai_estimated_cost_usd).toBeCloseTo(0.008, 8);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 127,
      totalPages: 3,
    });
    expect(selections).toContainEqual({ count: "exact", head: true });
    const listColumns = query.select.mock.calls.find(
      (call: any[]) => !call[1]?.head,
    )?.[0];
    expect(listColumns).toContain("image_count:full_request_body->imageCount");
    expect(listColumns).toContain(
      "event_status:full_request_body->context->status",
    );
    expect(listColumns).not.toMatch(/(?:^|, )full_request_body(?:,|$)/);
  });
  it("keeps search usable without a whole-table count and proves the next page with one extra row", async () => {
    process.env.ADMIN_SECRET = "secret";
    selections.length = 0;
    const res: any = {
      body: null,
      status() {
        return this;
      },
      json(body: any) {
        this.body = body;
        return this;
      },
    };
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer secret" },
        query: {
          action: "view-logs",
          log_type: "all",
          search: "web_app_view",
          limit: "50",
        },
      } as any,
      res,
    );
    expect(res.body.logs).toHaveLength(50);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: null,
      totalPages: null,
      hasMore: true,
    });
    expect(selections.some((option) => option?.head)).toBe(false);
    expect(query.or.mock.calls.at(-1)?.[0]).toBe(
      "endpoint.eq./event/web_app_view",
    );
  });
  it.each(["seller@example.invalid", "550e8400-e29b-41d4-a716-446655440000"])(
    "uses the existing user-id index for account search %s without cutting historical results",
    async (search) => {
      vi.clearAllMocks();
      process.env.ADMIN_SECRET = "secret";
      const res: any = {
        body: null,
        status() {
          return this;
        },
        json(body: any) {
          this.body = body;
          return this;
        },
      };
      await handler(
        {
          method: "GET",
          headers: { authorization: "Bearer secret" },
          query: { action: "view-logs", log_type: "all", search },
        } as any,
        res,
      );
      expect(res.body.logs).toHaveLength(50);
      expect(query.eq).toHaveBeenCalledWith(
        "user_id",
        "550e8400-e29b-41d4-a716-446655440000",
      );
      expect(query.or).not.toHaveBeenCalled();
      expect(query.gte).not.toHaveBeenCalled();
      expect(res.body.pagination.searchWindowDays).toBeUndefined();
    },
  );
});
