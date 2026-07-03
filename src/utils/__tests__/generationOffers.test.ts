import { beforeEach, describe, expect, it, vi } from "vitest";

const fromCalls: string[] = [];
const upsertCalls: Array<{ table: string; values: any; options: any }> = [];
const selectCalls: Array<{ table: string; columns: string }> = [];
const updateCalls: Array<{
  table: string;
  values: any;
  filters: Array<[string, any]>;
}> = [];
const rpcCalls: Array<{ name: string; params: any }> = [];
let upsertResponse: { data: any; error: any } = { data: null, error: null };
let maybeSingleResponse: { data: any; error: any } = {
  data: null,
  error: null,
};
let rpcResponse: { data: any; error: any } = { data: null, error: null };

function createBuilder(table: string) {
  const filters: Array<[string, any]> = [];
  const builder = {
    upsert: vi.fn((values: any, options: any) => {
      upsertCalls.push({ table, values, options });
      return builder;
    }),
    update: vi.fn((values: any) => {
      updateCalls.push({ table, values, filters });
      return builder;
    }),
    select: vi.fn((columns = "*") => {
      selectCalls.push({ table, columns });
      return builder;
    }),
    eq: vi.fn((column: string, value: any) => {
      filters.push([column, value]);
      return builder;
    }),
    single: vi.fn(async () => upsertResponse),
    maybeSingle: vi.fn(async () => maybeSingleResponse),
  };
  return builder;
}

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return createBuilder(table);
    }),
    rpc: vi.fn(async (name: string, params: any) => {
      rpcCalls.push({ name, params });
      return rpcResponse;
    }),
  },
}));

describe("generation offer helpers", () => {
  beforeEach(() => {
    fromCalls.length = 0;
    upsertCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
    upsertResponse = { data: null, error: null };
    maybeSingleResponse = { data: null, error: null };
    rpcResponse = { data: null, error: null };
    vi.clearAllMocks();
  });

  it("creates the label photo bonus for first free clothing generation", async () => {
    upsertResponse = {
      data: {
        id: "offer-1",
        campaign_key: "label_photo_bonus_2026_06",
        offer_code: "free_label_photo_generation",
        credit_amount: 1,
        status: "offered",
      },
      error: null,
    };

    const { maybeCreateGenerationOffer } =
      await import("../../../utils/generationOffers.js");
    const offers = await maybeCreateGenerationOffer({
      userId: "user-1",
      profile: {
        subscription_status: "free",
        subscription_tier: "free",
        api_calls_this_month: 0,
        free_lifetime_generations_used: 0,
        pack_credits: 0,
      },
      pricingLimitsMode: "current",
      generationMode: "manual",
      isClothing: true,
      reservationId: "reservation-1",
      extensionVersion: "1.3.24",
    });

    expect(offers).toEqual([
      expect.objectContaining({
        id: "offer-1",
        campaignKey: "label_photo_bonus_2026_06",
        offerCode: "free_label_photo_generation",
        creditAmount: 1,
      }),
    ]);
    expect(upsertCalls[0]).toMatchObject({
      table: "generation_offers",
      values: {
        user_id: "user-1",
        campaign_key: "label_photo_bonus_2026_06",
        offer_code: "free_label_photo_generation",
        credit_amount: 1,
        trigger_name: "first_free_clothing_generation",
      },
      options: {
        onConflict: "user_id,campaign_key",
        ignoreDuplicates: true,
      },
    });
  });

  it("does not create an offer after the first free generation", async () => {
    const { maybeCreateGenerationOffer } =
      await import("../../../utils/generationOffers.js");
    const offers = await maybeCreateGenerationOffer({
      userId: "user-1",
      profile: {
        subscription_status: "free",
        subscription_tier: "free",
        api_calls_this_month: 1,
        free_lifetime_generations_used: 1,
        pack_credits: 0,
      },
      pricingLimitsMode: "current",
      generationMode: "batch",
      isClothing: true,
      extensionVersion: "1.3.24",
    });

    expect(offers).toEqual([]);
    expect(upsertCalls).toHaveLength(0);
  });

  it("does not create an offer for extension versions without offer UI", async () => {
    const { maybeCreateGenerationOffer } =
      await import("../../../utils/generationOffers.js");
    const offers = await maybeCreateGenerationOffer({
      userId: "user-1",
      profile: {
        subscription_status: "free",
        subscription_tier: "free",
        api_calls_this_month: 0,
        free_lifetime_generations_used: 0,
        pack_credits: 0,
      },
      pricingLimitsMode: "current",
      generationMode: "manual",
      isClothing: true,
      extensionVersion: "1.3.23",
    });

    expect(offers).toEqual([]);
    expect(upsertCalls).toHaveLength(0);
  });

  it("claims an offered generation by granting a credit and marking it claimed", async () => {
    maybeSingleResponse = {
      data: {
        id: "offer-1",
        campaign_key: "label_photo_bonus_2026_06",
        offer_code: "free_label_photo_generation",
        credit_amount: 1,
        status: "offered",
      },
      error: null,
    };
    rpcResponse = { data: 2, error: null };

    const { claimGenerationOffer } =
      await import("../../../utils/generationOffers.js");
    const result = await claimGenerationOffer("user-1", "offer-1");

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: {
        ok: true,
        offerId: "offer-1",
        packCredits: 2,
      },
    });
    expect(selectCalls[0]).toEqual({
      table: "generation_offers",
      columns: "id, campaign_key, offer_code, credit_amount, status",
    });
    expect(rpcCalls[0]).toEqual({
      name: "grant_credit_pack",
      params: {
        p_user_id: "user-1",
        p_stripe_session_id: "generation_offer:offer-1",
        p_credits: 1,
        p_metadata: {
          source: "generation_offer",
          campaign_key: "label_photo_bonus_2026_06",
          offer_code: "free_label_photo_generation",
          offer_id: "offer-1",
        },
      },
    });
    expect(updateCalls[0]).toMatchObject({
      table: "generation_offers",
      values: { status: "claimed" },
      filters: [
        ["id", "offer-1"],
        ["user_id", "user-1"],
        ["status", "offered"],
      ],
    });
  });

  it("dismisses an offered generation through the RPC", async () => {
    rpcResponse = {
      data: {
        ok: true,
        offerId: "offer-1",
        status: "dismissed",
      },
      error: null,
    };

    const { dismissGenerationOffer } =
      await import("../../../utils/generationOffers.js");
    const result = await dismissGenerationOffer("user-1", "offer-1");

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: {
        ok: true,
        offerId: "offer-1",
        status: "dismissed",
      },
    });
    expect(rpcCalls[0]).toEqual({
      name: "dismiss_generation_offer",
      params: {
        p_user_id: "user-1",
        p_offer_id: "offer-1",
      },
    });
  });
});
