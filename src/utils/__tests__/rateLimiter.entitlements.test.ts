import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseResponse = {
  data: unknown;
  error?: { code?: string; message?: string } | null;
};

const singleResponses = new Map<string, SupabaseResponse[]>();
const rpcResponses: SupabaseResponse[] = [];
const fromCalls: string[] = [];
const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];

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

function queueRpc(response: SupabaseResponse) {
  rpcResponses.push(response);
}

function popRpc(): SupabaseResponse {
  const response = rpcResponses.shift();
  if (!response) {
    throw new Error("Unexpected Supabase .rpc() call");
  }

  return response;
}

function createQueryBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
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
    rpc: vi.fn(async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return popRpc();
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
    rpcResponses.length = 0;
    fromCalls.length = 0;
    rpcCalls.length = 0;
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

  it("reports free batch capacity from remaining lifetime listings", async () => {
    queueCommonPreflight();

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.getGenerationCapacity("user-free-three-left", {
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 0,
      free_lifetime_generations_used: 2,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: true,
      available: 3,
      tier: "free",
      remaining: {
        day: null,
        month: 0,
        freeLifetime: 3,
        packCredits: 0,
      },
    });
  });

  it("adds pack credits to exhausted free batch capacity", async () => {
    queueCommonPreflight();

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.getGenerationCapacity("user-free-pack-capacity", {
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 999,
      free_lifetime_generations_used: 5,
      pack_credits: 4,
    });

    expect(result).toMatchObject({
      allowed: true,
      available: 4,
      remaining: {
        freeLifetime: 0,
        packCredits: 4,
      },
    });
  });

  it("caps paid batch capacity by the lower daily or monthly remainder", async () => {
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(7);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.getGenerationCapacity("user-starter-capacity", {
      subscription_status: "active",
      subscription_tier: "starter",
      api_calls_this_month: 70,
      is_legacy_plan: false,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: true,
      available: 3,
      tier: "starter",
      remaining: {
        day: 3,
        month: 5,
        packCredits: 0,
      },
    });
  });

  it("adds pack credits beyond paid plan capacity", async () => {
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(10);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.getGenerationCapacity("user-pro-pack-capacity", {
      subscription_status: "active",
      subscription_tier: "pro",
      api_calls_this_month: 249,
      is_legacy_plan: false,
      pack_credits: 6,
    });

    expect(result).toMatchObject({
      allowed: true,
      available: 7,
      remaining: {
        day: 15,
        month: 1,
        packCredits: 6,
      },
    });
  });

  it("reports zero paid batch capacity when hard limits and pack credits are exhausted", async () => {
    queueCommonPreflight();
    queueRateCount(0);
    queueRateCount(10);

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.getGenerationCapacity("user-starter-zero-capacity", {
      subscription_status: "active",
      subscription_tier: "starter",
      api_calls_this_month: 75,
      is_legacy_plan: false,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: false,
      available: 0,
      reason: "monthly_limit",
      remaining: {
        day: 0,
        month: 0,
        packCredits: 0,
      },
    });
  });

  it("reserves generation through the atomic reservation RPC", async () => {
    queueRpc({
      data: {
        allowed: true,
        reservationId: "reservation-1",
        remainingRequests: {
          minute: 9,
          day: 8,
          month: 73,
          packCredits: 0,
        },
      },
      error: null,
    });

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.reserveGenerationRequest("user-starter", {
      subscription_status: "active",
      subscription_tier: "starter",
      api_calls_this_month: 1,
      is_legacy_plan: false,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: true,
      remainingRequests: {
        minute: 9,
        day: 8,
        month: 73,
      },
      reservationId: "reservation-1",
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      name: "reserve_generation_request",
      params: {
        p_user_id: "user-starter",
        p_effective_tier: "starter",
        p_monthly_limit: 75,
        p_daily_limit: 10,
        p_burst_limit: 10,
      },
    });
  });

  it("fails closed when generation reservation cannot be made", async () => {
    queueRpc({
      data: null,
      error: { message: "function missing" },
    });

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.reserveGenerationRequest("user-starter", {
      subscription_status: "active",
      subscription_tier: "starter",
      api_calls_this_month: 1,
      is_legacy_plan: false,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: false,
      code: "service_unavailable",
      limitScope: "service",
    });
  });

  it("reserves one free no-emoji retry without consuming listing quota", async () => {
    queueSingle("system_settings", { data: null, error: null });
    queueSingle("daily_stats", {
      data: { total_api_calls: 3, estimated_cost: 0.06 },
      error: null,
    });
    queueSingle("generation_reservations", {
      data: null,
      error: { code: "PGRST116" },
    });
    queueSingle("generation_reservations", {
      data: { id: "emoji-retry-reservation" },
      error: null,
    });

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.reserveEmojiRetry("user-free", {
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 5,
      free_lifetime_generations_used: 5,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: true,
      reservationId: "emoji-retry-reservation",
      remainingRequests: {
        freeLifetime: 0,
        packCredits: 0,
      },
    });
    expect(fromCalls).toContain("generation_reservations");
    expect(fromCalls).toContain("daily_stats");
  });

  it("does not reserve a second free no-emoji retry", async () => {
    queueSingle("system_settings", { data: null, error: null });
    queueSingle("daily_stats", {
      data: { total_api_calls: 3, estimated_cost: 0.06 },
      error: null,
    });
    queueSingle("generation_reservations", {
      data: { id: "existing-emoji-retry" },
      error: null,
    });

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    const result = await RateLimiter.reserveEmojiRetry("user-free", {
      subscription_status: "free",
      subscription_tier: "free",
      api_calls_this_month: 5,
      free_lifetime_generations_used: 5,
      pack_credits: 0,
    });

    expect(result).toMatchObject({
      allowed: false,
      code: "emoji_retry_used",
    });
  });

  it("commits a successful generation reservation", async () => {
    queueRpc({
      data: true,
      error: null,
    });

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    await RateLimiter.commitGenerationReservation("reservation-commit");

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      name: "commit_generation_reservation",
      params: {
        p_reservation_id: "reservation-commit",
      },
    });
  });

  it("refunds a failed generation reservation", async () => {
    queueRpc({
      data: true,
      error: null,
    });

    const { RateLimiter } = await import("../../../utils/rateLimiter.js");
    await RateLimiter.refundGenerationReservation(
      "reservation-refund",
      "generation_failed",
    );

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      name: "refund_generation_reservation",
      params: {
        p_reservation_id: "reservation-refund",
        p_reason: "generation_failed",
      },
    });
  });
});
