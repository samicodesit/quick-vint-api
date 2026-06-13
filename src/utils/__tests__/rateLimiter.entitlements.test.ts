import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseResponse = {
  data: unknown;
  error?: { code?: string; message?: string } | null;
};

const singleResponses = new Map<string, SupabaseResponse[]>();
const fromCalls: string[] = [];

function queueSingle(table: string, response: SupabaseResponse) {
  const queue = singleResponses.get(table) || [];
  queue.push(response);
  singleResponses.set(table, queue);
}

function popSingle(table: string): SupabaseResponse {
  const queue = singleResponses.get(table) || [];
  const response = queue.shift();
  singleResponses.set(table, queue);

  if (!response) {
    throw new Error(`Unexpected Supabase .single() call for "${table}"`);
  }

  return response;
}

function createQueryBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(async () => popSingle(table)),
    maybeSingle: vi.fn(async () => popSingle(table)),
  };

  return builder;
}

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return createQueryBuilder(table);
    }),
  },
}));

function queueCommonPreflight() {
  queueSingle("system_settings", { data: null, error: null });
  queueSingle("daily_stats", {
    data: { total_api_calls: 0, estimated_cost: 0 },
    error: null,
  });
  queueSingle("profiles", {
    data: {
      custom_daily_limit: null,
      custom_limit_expires_at: null,
      custom_limit_reason: null,
    },
    error: null,
  });
}

function queueRateCount(count: number) {
  queueSingle("rate_limits", { data: { count }, error: null });
}

describe("RateLimiter entitlement decisions", () => {
  beforeEach(() => {
    process.env.PRICING_LIMITS_MODE = "current";
    singleResponses.clear();
    fromCalls.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PRICING_LIMITS_MODE;
  });

  it("blocks free users after exactly 5 lifetime listings when no pack credits exist", async () => {
    queueCommonPreflight();
    queueRateCount(0);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit("user-free-exhausted", {
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 999,
      free_lifetime_generations_used: 5,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: false,
      code: "free_lifetime_limit",
      currentTier: "free",
      nextTier: "starter",
      currentLimit: 5,
    });
  });

  it("allows free users past the lifetime limit when pack credits are available", async () => {
    queueCommonPreflight();
    queueRateCount(0);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit("user-free-with-pack", {
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 999,
      free_lifetime_generations_used: 5,
      pack_credits: 2,
    });

    expect(result).toMatchObject({
      allowed: true,
      remainingRequests: {
        day: null,
        month: 0,
        freeLifetime: 0,
        packCredits: 2,
      },
    });
  });

  it("blocks a new Starter subscriber at the new 75 monthly limit", async () => {
    queueCommonPreflight();

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit("user-new-starter", {
      subscription_status: "active",
      subscription_tier: "starter",
      api_calls_this_month: 75,
      is_legacy_plan: false,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: false,
      code: "monthly_limit",
      currentTier: "starter",
      nextTier: "pro",
      currentLimit: 75,
    });
  });

  it("does not cap an active legacy Starter subscriber at the new 75 monthly limit", async () => {
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(0);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit("user-legacy-starter", {
      subscription_status: "active",
      subscription_tier: "starter",
      api_calls_this_month: 100,
      is_legacy_plan: true,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: true,
      remainingRequests: {
        day: 14,
        month: 199,
      },
    });
  });

  it("allows paid users over their daily plan limit only when top-up credits exist", async () => {
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(25);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit("user-pro-with-pack", {
      subscription_status: "active",
      subscription_tier: "pro",
      api_calls_this_month: 50,
      is_legacy_plan: false,
      pack_credits: 3,
    });

    expect(result).toMatchObject({
      allowed: true,
      remainingRequests: {
        day: 0,
        packCredits: 3,
      },
    });
  });

  it("keeps free users on old recurring monthly limits in legacy compatibility mode", async () => {
    process.env.PRICING_LIMITS_MODE = "legacy";
    queueCommonPreflight();

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit(
      "user-free-legacy-mode",
      {
        subscription_status: "free",
        subscription_tier: "free",
        api_calls_this_month: 8,
        free_lifetime_generations_used: 5,
        pack_credits: 0,
      },
      "legacy",
    );

    expect(result).toMatchObject({
      allowed: false,
      code: "monthly_limit",
      currentTier: "free",
      nextTier: "starter",
      currentLimit: 8,
    });
  });

  it("keeps Business daily usage uncapped in legacy compatibility mode", async () => {
    process.env.PRICING_LIMITS_MODE = "legacy";
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(999);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit(
      "user-business-legacy-mode",
      {
        subscription_status: "active",
        subscription_tier: "business",
        api_calls_this_month: 200,
        is_legacy_plan: false,
        pack_credits: 0,
      },
      "legacy",
    );

    expect(result).toMatchObject({
      allowed: true,
      remainingRequests: {
        day: null,
        month: 1299,
      },
    });
  });

  it("keeps active legacy Business daily usage uncapped after the new extension rollout", async () => {
    process.env.PRICING_LIMITS_MODE = "current";
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(999);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.checkRateLimit(
      "user-business-legacy-current-mode",
      {
        subscription_status: "active",
        subscription_tier: "business",
        api_calls_this_month: 200,
        is_legacy_plan: true,
        pack_credits: 0,
      },
      "current",
    );

    expect(result).toMatchObject({
      allowed: true,
      remainingRequests: {
        day: null,
        month: 1299,
      },
    });
  });
});
