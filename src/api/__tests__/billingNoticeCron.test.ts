import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  withdrawals: [] as { status: string; received_at: string }[],
  review: 0,
  welcomeReview: 0,
  due: [] as { key: string }[],
  errorTable: "",
  send: vi.fn(),
  report: vi.fn(),
}));
vi.mock("../../../utils/billingNotices", () => ({
  deliverBillingNotice: fx.send,
}));
vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: fx.report,
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from(table: string) {
      const filters: ((row: any) => boolean)[] = [];
      const q: any = {
        select: () => q,
        in: () => q,
        or: () => q,
        order: () => q,
        limit: () => q,
        eq: (key: string, value: string) => {
          filters.push((row) => row[key] === value);
          return q;
        },
        neq: (key: string, value: string) => {
          filters.push((row) => row[key] !== value);
          return q;
        },
        lt: (key: string, value: string) => {
          filters.push((row) => row[key] < value);
          return q;
        },
        then(resolve: any, reject: any) {
          const count =
            table === "billing_withdrawals"
              ? fx.withdrawals.filter((row) => filters.every((f) => f(row)))
                  .length
              : table === "subscription_welcome_emails"
                ? fx.welcomeReview
                : fx.review;
          return Promise.resolve({
            data: table === "billing_notices" ? fx.due : [],
            count,
            error:
              table === fx.errorTable
                ? new Error("database unavailable")
                : null,
          }).then(resolve, reject);
        },
      };
      return q;
    },
  },
}));
import handler from "../../../api/cron/billing-notices";

async function run() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
  await handler(
    { headers: { authorization: "Bearer isolated-cron" } } as any,
    res,
  );
  return res;
}
describe("billing notice cron attention guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
    process.env.CRON_SECRET = "isolated-cron";
    Object.assign(fx, {
      withdrawals: [],
      review: 0,
      welcomeReview: 0,
      due: [],
      errorTable: "",
    });
    vi.clearAllMocks();
    fx.send.mockResolvedValue("sent");
  });
  afterEach(() => vi.useRealTimers());
  it("keeps an already triaged identification request pending without reporting a server failure", async () => {
    fx.withdrawals = [
      { status: "processing", received_at: "2026-11-14T21:05:25.128Z" },
    ];
    for (const release of ["old-release", "new-release", "next-release"]) {
      process.env.VERCEL_GIT_COMMIT_SHA = release;
      const res = await run();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ processed: 0, withdrawalsProcessing: 1 });
    }
    expect(fx.report).not.toHaveBeenCalled();
    expect(fx.send).not.toHaveBeenCalled();
    expect(fx.withdrawals[0].status).toBe("processing");
  });
  it("still reports an untouched withdrawal after 24 hours", async () => {
    fx.withdrawals = [
      { status: "received", received_at: "2026-11-14T21:05:25.128Z" },
    ];
    expect((await run()).statusCode).toBe(500);
    expect(fx.report).toHaveBeenCalledOnce();
  });
  it("does not escalate a newly received or resolved withdrawal", async () => {
    fx.withdrawals = [
      { status: "received", received_at: "2026-11-16T08:00:00Z" },
      { status: "resolved", received_at: "2026-11-14T21:05:25.128Z" },
    ];
    expect((await run()).statusCode).toBe(200);
    expect(fx.report).not.toHaveBeenCalled();
  });
  it.each(["review", "welcomeReview"] as const)(
    "still reports %s holds with a processing request",
    async (key) => {
      fx[key] = 1;
      fx.withdrawals = [
        { status: "processing", received_at: "2026-11-14T21:05:25.128Z" },
      ];
      expect((await run()).statusCode).toBe(500);
      expect(fx.report).toHaveBeenCalledOnce();
    },
  );
  it("still reports failed notice delivery", async () => {
    fx.due = [{ key: "notice" }];
    fx.send.mockResolvedValue("failed");
    expect((await run()).statusCode).toBe(500);
    expect(fx.send).toHaveBeenCalledWith("notice");
  });
  it.each([
    "billing_notices",
    "subscription_welcome_emails",
    "billing_withdrawals",
  ])("does not hide %s database failures", async (table) => {
    fx.errorTable = table;
    expect((await run()).statusCode).toBe(500);
    expect(fx.report).toHaveBeenCalledOnce();
  });
});
