import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: any, res: any) => Promise<unknown>;

const updateMock = vi.fn();
const lteMock = vi.fn();
const orMock = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => {
      const query = {
        update: updateMock.mockImplementation(() => query),
        lte: lteMock.mockImplementation(() => query),
        or: orMock.mockImplementation(async () => ({ error: null })),
      };
      return query;
    }),
  },
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

describe("legacy monthly usage reset", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron_test";
    delete process.env.PRICING_LIMITS_MODE;
    vi.clearAllMocks();
  });

  it("does nothing in the current pricing mode", async () => {
    const module = await import("../../../api/cron/reset-counts.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, skipped: true });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("resets only non-entitled profiles in legacy mode", async () => {
    process.env.PRICING_LIMITS_MODE = "legacy";
    const module = await import("../../../api/cron/reset-counts.js");
    const handler = module.default as unknown as Handler;
    const res = createResponse();

    await handler(
      { headers: { authorization: "Bearer cron_test" } },
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ api_calls_this_month: 0 }),
    );
    expect(lteMock).toHaveBeenCalledWith(
      "last_api_call_reset",
      expect.any(String),
    );
    expect(orMock).toHaveBeenCalledWith(
      "subscription_status.is.null,subscription_status.not.in.(active,trialing,past_due,canceling)",
    );
  });
});
