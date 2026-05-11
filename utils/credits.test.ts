import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mock state so vi.mock factory can reference it ─────────────────────

const { mockEq, mockSingle, mockInsert, mockFrom, mockRpc } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockSingle = vi.fn();
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockRpc = vi.fn();

  const mockFrom = vi.fn().mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single: mockSingle })),
    })),
    update: vi.fn(() => ({ eq: mockEq })),
    insert: mockInsert,
  }));

  return { mockEq, mockSingle, mockInsert, mockFrom, mockRpc };
});

vi.mock("./supabaseClient", () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import {
  consumeCredit,
  grantSubscriptionCredits,
  upgradeSubscriptionCredits,
  freezeSubscriptionCreditsOnFailure,
  expireFrozenRollover,
  deliverWeeklyDrip,
  giveSignupBonus,
} from "./credits";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stubProfile(data: Record<string, unknown>) {
  mockSingle.mockResolvedValue({ data, error: null });
}

/** Returns the payload passed to the last update().eq() chain */
function lastUpdatePayload(): Record<string, unknown> {
  const fromCalls = mockFrom.mock.results;
  for (let i = fromCalls.length - 1; i >= 0; i--) {
    const instance = fromCalls[i]?.value;
    if (!instance?.update) continue;
    const updateCalls = instance.update.mock?.calls;
    if (updateCalls?.length) {
      return updateCalls[updateCalls.length - 1][0] ?? {};
    }
  }
  return {};
}

beforeEach(() => {
  vi.clearAllMocks();

  mockEq.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });

  mockFrom.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single: mockSingle })),
    })),
    update: vi.fn(() => ({ eq: mockEq })),
    insert: mockInsert,
  }));
});

/**
 * Stubs the consume_credit_atomic RPC. The atomic Postgres function returns
 * the new balance row on success and NULL when no credits remain. Pass
 * `null` to simulate insufficient credits.
 */
function stubConsumeCreditRpc(
  newBalance: { sub: number; rollover: number; pack: number } | null,
) {
  if (newBalance === null) {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
  } else {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          subscription_credits: newBalance.sub,
          rollover_credits: newBalance.rollover,
          pack_credits: newBalance.pack,
        },
      ],
      error: null,
    });
  }
}

// ─── consumeCredit ─────────────────────────────────────────────────────────────

describe("consumeCredit", () => {
  it("burns subscription_credits first when both pools are available", async () => {
    stubConsumeCreditRpc({ sub: 9, rollover: 2, pack: 5 });

    const result = await consumeCredit("user-1");

    expect(result.success).toBe(true);
    expect(result.balance.subscription_credits).toBe(9);
    expect(result.balance.pack_credits).toBe(5);
  });

  it("burns pack_credits only after subscription_credits are exhausted", async () => {
    stubConsumeCreditRpc({ sub: 0, rollover: 0, pack: 2 });

    const result = await consumeCredit("user-2");

    expect(result.success).toBe(true);
    expect(result.balance.subscription_credits).toBe(0);
    expect(result.balance.pack_credits).toBe(2);
  });

  it("does not touch pack_credits while subscription_credits remain", async () => {
    stubConsumeCreditRpc({ sub: 4, rollover: 0, pack: 10 });

    const result = await consumeCredit("user-3");

    expect(result.success).toBe(true);
    expect(result.balance.subscription_credits).toBe(4);
    expect(result.balance.pack_credits).toBe(10);
  });

  it("returns success:false with no credits and does not write to DB", async () => {
    stubConsumeCreditRpc(null);
    stubProfile({
      subscription_credits: 0,
      rollover_credits: 0,
      pack_credits: 0,
    });

    const result = await consumeCredit("user-4");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient credits");
    expect(result.balance.total).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("reports correct total after consuming last subscription credit", async () => {
    stubConsumeCreditRpc({ sub: 0, rollover: 0, pack: 4 });

    const result = await consumeCredit("user-5");

    expect(result.success).toBe(true);
    expect(result.balance.total).toBe(4);
  });
});

// ─── grantSubscriptionCredits ─────────────────────────────────────────────────

describe("grantSubscriptionCredits", () => {
  const CYCLE_END = "2026-06-07T00:00:00.000Z";

  it("banks unused subscription_credits as rollover up to the cap", async () => {
    stubProfile({
      subscription_credits: 50,
      pack_credits: 0,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-6", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.rollover_credits).toBe(50);
    expect(payload.subscription_credits).toBe(130); // 50 rollover + 80 new
  });

  it("caps rollover at 3× monthly when unused credits exceed the cap", async () => {
    stubProfile({
      subscription_credits: 500,
      pack_credits: 0,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-7", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.rollover_credits).toBe(240); // hard cap
    expect(payload.subscription_credits).toBe(320); // 240 + 80
  });

  it("grants exactly the monthly amount when starting from zero (first subscribe)", async () => {
    stubProfile({
      subscription_credits: 0,
      pack_credits: 5,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-8", 200, 600, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.rollover_credits).toBe(0);
    expect(payload.subscription_credits).toBe(200);
  });

  it("trims excess rollover on downgrade via the new tier's lower cap", async () => {
    stubProfile({
      subscription_credits: 900,
      pack_credits: 0,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-9", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.rollover_credits).toBe(240); // trimmed to Starter cap
    expect(payload.subscription_credits).toBe(320); // 240 + 80
  });

  it("preserves rollover within cap on same-tier renewal", async () => {
    stubProfile({
      subscription_credits: 30,
      pack_credits: 0,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-10", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.rollover_credits).toBe(30);
    expect(payload.subscription_credits).toBe(110); // 30 + 80
  });

  it("writes the correct cycle_end timestamp", async () => {
    stubProfile({
      subscription_credits: 0,
      pack_credits: 0,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-11", 400, 1200, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.credits_cycle_end).toBe(CYCLE_END);
  });

  it("marks the user as non-legacy", async () => {
    stubProfile({
      subscription_credits: 0,
      pack_credits: 0,
      rollover_credits: 0,
      rollover_frozen_until: null,
    });

    await grantSubscriptionCredits("user-12", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.is_legacy_plan).toBe(false);
  });

  it("restores frozen rollover on resubscription within the freeze window", async () => {
    const futureDate = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    stubProfile({
      subscription_credits: 0,
      pack_credits: 0,
      rollover_credits: 150, // frozen credits stored here
      rollover_frozen_until: futureDate,
    });

    await grantSubscriptionCredits("user-13", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    // 150 frozen credits are used as the starting balance before banking
    expect(payload.rollover_credits).toBe(150); // banked (within 240 cap)
    expect(payload.subscription_credits).toBe(230); // 150 + 80 new
    expect(payload.rollover_frozen_until).toBeNull();
  });

  it("does not use frozen rollover after the freeze window has expired", async () => {
    const pastDate = new Date(
      Date.now() - 1 * 24 * 60 * 60 * 1000,
    ).toISOString();
    stubProfile({
      subscription_credits: 0,
      pack_credits: 0,
      rollover_credits: 150,
      rollover_frozen_until: pastDate, // already expired
    });

    await grantSubscriptionCredits("user-14", 80, 240, CYCLE_END);

    const payload = lastUpdatePayload();
    // Expired freeze — uses actual subscription_credits (0) as base
    expect(payload.rollover_credits).toBe(0);
    expect(payload.subscription_credits).toBe(80);
  });
});

// ─── upgradeSubscriptionCredits ───────────────────────────────────────────────

describe("upgradeSubscriptionCredits", () => {
  const CYCLE_END = "2026-06-07T00:00:00.000Z";

  it("adds prorated credits on top of existing subscription_credits", async () => {
    stubProfile({ subscription_credits: 45, pack_credits: 0 });

    await upgradeSubscriptionCredits("user-20", 200, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(245); // 45 existing + 200 prorated
  });

  it("does not touch pack_credits", async () => {
    stubProfile({ subscription_credits: 10, pack_credits: 8 });

    await upgradeSubscriptionCredits("user-21", 150, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(160);
    // pack_credits not included in update payload
    expect(payload.pack_credits).toBeUndefined();
  });

  it("sets the new cycle_end and marks non-legacy", async () => {
    stubProfile({ subscription_credits: 0, pack_credits: 0 });

    await upgradeSubscriptionCredits("user-22", 100, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.credits_cycle_end).toBe(CYCLE_END);
    expect(payload.is_legacy_plan).toBe(false);
  });

  it("preserves all existing credits even when prorated amount is 0", async () => {
    stubProfile({ subscription_credits: 80, pack_credits: 5 });

    await upgradeSubscriptionCredits("user-23", 0, CYCLE_END);

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(80); // unchanged
  });
});

// ─── freezeSubscriptionCreditsOnFailure ───────────────────────────────────────

describe("freezeSubscriptionCreditsOnFailure", () => {
  const FROZEN_UNTIL = "2026-06-21T00:00:00.000Z";

  it("moves subscription_credits into rollover_credits for recovery", async () => {
    stubProfile({ subscription_credits: 120, pack_credits: 5 });

    await freezeSubscriptionCreditsOnFailure("user-30", FROZEN_UNTIL);

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(0);
    expect(payload.rollover_credits).toBe(120); // stored for recovery
    expect(payload.rollover_frozen_until).toBe(FROZEN_UNTIL);
    expect(payload.credits_cycle_end).toBeNull();
  });

  it("does not affect pack_credits", async () => {
    stubProfile({ subscription_credits: 50, pack_credits: 15 });

    await freezeSubscriptionCreditsOnFailure("user-31", FROZEN_UNTIL);

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(0);
    expect(payload.rollover_credits).toBe(50);
    // pack_credits not in payload
    expect(payload.pack_credits).toBeUndefined();
  });

  it("clears payment_grace_started_at and resets day5 flag", async () => {
    stubProfile({ subscription_credits: 10, pack_credits: 0 });

    await freezeSubscriptionCreditsOnFailure("user-32", FROZEN_UNTIL);

    const payload = lastUpdatePayload();
    expect(payload.payment_grace_started_at).toBeNull();
    expect(payload.payment_day5_email_sent).toBe(false);
  });
});

// ─── expireFrozenRollover ──────────────────────────────────────────────────────

describe("expireFrozenRollover", () => {
  it("zeros out rollover_credits and clears rollover_frozen_until", async () => {
    stubProfile({ rollover_credits: 120, pack_credits: 5 });

    await expireFrozenRollover("user-40");

    const payload = lastUpdatePayload();
    expect(payload.rollover_credits).toBe(0);
    expect(payload.rollover_frozen_until).toBeNull();
  });

  it("logs a transaction when frozen credits exist", async () => {
    stubProfile({ rollover_credits: 80, pack_credits: 0 });

    await expireFrozenRollover("user-41");

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const insertArgs = mockInsert.mock.calls[0][0];
    expect(insertArgs.amount).toBe(-80);
    expect(insertArgs.type).toBe("rollover_expiry");
  });

  it("skips the transaction log when there are no frozen credits", async () => {
    stubProfile({ rollover_credits: 0, pack_credits: 0 });

    await expireFrozenRollover("user-42");

    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ─── deliverWeeklyDrip ─────────────────────────────────────────────────────────

describe("deliverWeeklyDrip", () => {
  it("adds exactly 2 credits and increments weeks_delivered counter", async () => {
    stubProfile({
      subscription_credits: 3,
      pack_credits: 0,
      free_drip_weeks_delivered: 1,
    });

    await deliverWeeklyDrip("user-13");

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(5); // 3 + 2
    expect(payload.free_drip_weeks_delivered).toBe(2);
  });

  it("works correctly from zero credits (all credits were spent)", async () => {
    stubProfile({
      subscription_credits: 0,
      pack_credits: 0,
      free_drip_weeks_delivered: 0,
    });

    await deliverWeeklyDrip("user-14");

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(2);
    expect(payload.free_drip_weeks_delivered).toBe(1);
  });
});

// ─── giveSignupBonus ───────────────────────────────────────────────────────────

describe("giveSignupBonus", () => {
  it("grants 5 credits, resets drip counter, and starts the drip clock", async () => {
    await giveSignupBonus("user-15");

    const payload = lastUpdatePayload();
    expect(payload.subscription_credits).toBe(5);
    expect(payload.free_drip_weeks_delivered).toBe(0);
    expect(typeof payload.free_drip_started_at).toBe("string");
    expect(payload.is_legacy_plan).toBe(false);
  });
});
