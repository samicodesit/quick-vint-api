import { describe, expect, it, vi } from "vitest";

const { selections, query } = vi.hoisted(() => {
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
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `log-${i}`,
            endpoint: "/event/telemetry_queue_dropped",
          })),
          error: null,
        };
    return query;
  });
  query.then = (resolve: any) => Promise.resolve(query.result).then(resolve);
  return { selections, query };
});
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from: vi.fn(() => query) },
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
          search: "seller@example.invalid",
          page: "1",
          limit: "50",
        },
      } as any,
      res,
    );
    expect(res.body.logs).toHaveLength(50);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 127,
      totalPages: 3,
    });
    expect(selections).toContainEqual({ count: "exact", head: true });
  });
});
