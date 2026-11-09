import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDraftFiveOffer } from "../../../utils/draftFiveOffer";
import { verifyPricingOfferToken } from "../../../utils/pricingOfferToken";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { from } }));

function query(data: unknown) {
  const result = { data, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    like: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return builder;
}

const now = new Date("2026-11-09T09:00:00Z");
const user = { id: "seller-id", email: "seller@example.com" };
const profile = {
  account_status: "active",
  subscription_status: "free",
  subscription_tier: "free",
  pack_credits: 0,
  free_lifetime_generations_used: 5,
};
const drafts = [0, 1, 2, 3, 4].map((index) => ({
  committed_at: `2026-11-09T08:0${index}:00Z`,
}));

describe("draft five web offer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("DRAFT_FIVE_OFFER_ENABLED", "true");
    vi.stubEnv("PRICING_OFFER_TOKEN_SECRET", "unit-test-only");
    from.mockReset();
    from.mockImplementation((table: string) =>
      query(
        table === "profiles"
          ? profile
          : table === "generation_reservations"
            ? drafts
            : [],
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("starts a fixed 72-hour offer from the committed fifth draft without a limit error or email subscription", async () => {
    const offer = await getDraftFiveOffer(user);
    expect(offer?.expiresAt).toBe("2026-11-12T08:04:00.000Z");
    expect(verifyPricingOfferToken(offer!.offerToken)).toMatchObject({
      email: user.email,
      targetTier: "pro",
      couponCode: "LISTFASTER20",
      expiresAt: offer!.expiresAt,
    });
    expect(from).not.toHaveBeenCalledWith("api_logs");
  });

  it("does not offer a discount to a past buyer who is free again", async () => {
    from.mockImplementation((table: string) =>
      query(
        table === "profiles"
          ? profile
          : table === "generation_reservations"
            ? drafts
            : table === "billing_events"
              ? [{ id: "invoice" }]
              : [],
      ),
    );
    expect(await getDraftFiveOffer(user)).toBeNull();
  });

  it("does not restart the offer window when a seller returns later", async () => {
    vi.setSystemTime(new Date("2026-11-12T08:04:00Z"));
    expect(await getDraftFiveOffer(user)).toBeNull();
  });

  it("does not infer five completed drafts from a full shared IP allowance", async () => {
    from.mockImplementation((table: string) =>
      query(
        table === "profiles"
          ? { ...profile, free_lifetime_generations_used: 3 }
          : drafts,
      ),
    );
    expect(await getDraftFiveOffer(user)).toBeNull();
  });

  it("stays off until the campaign is enabled", async () => {
    vi.stubEnv("DRAFT_FIVE_OFFER_ENABLED", "false");
    expect(await getDraftFiveOffer(user)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
