import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();
const findLimitFollowupRecipientsMock = vi.fn();
const getAllLimitFollowupExclusionsMock = vi.fn();
const createPricingOfferUrlMock = vi.fn();

vi.mock("cors", () => ({
  default: vi.fn(() => (_req: unknown, _res: unknown, callback: (err?: unknown) => void) =>
    callback(),
  ),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}));

vi.mock("../../../utils/pricingOfferToken", () => ({
  createPricingOfferUrl: createPricingOfferUrlMock,
}));

vi.mock("../../../utils/limitFollowupEligibility", () => ({
  LIMIT_FOLLOWUP_COUPON_CODE: "LISTFASTER20",
  findLimitFollowupRecipients: findLimitFollowupRecipientsMock,
  getAllLimitFollowupExclusions: getAllLimitFollowupExclusionsMock,
  normalizeEmailForCampaign: (email?: string | null) =>
    String(email || "").trim().toLowerCase(),
}));

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    end: vi.fn(() => res),
  };

  return res;
}

describe("limit follow-up on-page offer endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "seller@example.com" } },
      error: null,
    });
    getAllLimitFollowupExclusionsMock.mockResolvedValue({
      excludedEmails: new Set<string>(),
      excludedUserIds: new Set<string>(),
    });
    findLimitFollowupRecipientsMock.mockResolvedValue([
      {
        id: "user-1",
        email: "seller@example.com",
        unsubscribe_token: "unsub-1",
        limitHitAt: "2026-07-02T10:00:00.000Z",
      },
    ]);
    createPricingOfferUrlMock.mockReturnValue(
      "https://autolister.app/pricing?offer=test-token",
    );
    fromMock.mockReset();
  });

  it("requires a real free-limit hit before showing the on-page discount offer", async () => {
    const handlerModule = await import(
      "../../../api/user/limit-followup-offer.js"
    );
    const handler = handlerModule.default as unknown as (
      req: unknown,
      res: unknown,
    ) => Promise<unknown>;

    const req = {
      method: "GET",
      headers: {
        authorization: "Bearer access-token",
        origin: "https://www.vinted.fr",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(findLimitFollowupRecipientsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        minDelayMinutes: 0,
        requireExplicitLimitHit: true,
      }),
    );
    expect(res.body).toMatchObject({
      eligible: true,
      couponCode: "LISTFASTER20",
      pricingUrl: "https://autolister.app/pricing?offer=test-token",
    });
  });

  it("allows the extension origin used by content-script authenticated requests", async () => {
    const handlerModule = await import(
      "../../../api/user/limit-followup-offer.js"
    );

    expect(
      handlerModule.isAllowedLimitFollowupOrigin(
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(true);
    expect(
      handlerModule.isAllowedLimitFollowupOrigin("https://www.vinted.nl"),
    ).toBe(true);
    expect(
      handlerModule.isAllowedLimitFollowupOrigin("https://evil.example"),
    ).toBe(false);
  });

  it("lets the internal test account preview the on-page offer without email campaign eligibility", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "test-user-1", email: "samicodesit@gmail.com" } },
      error: null,
    });
    getAllLimitFollowupExclusionsMock.mockResolvedValue({
      excludedEmails: new Set<string>(["samicodesit@gmail.com"]),
      excludedUserIds: new Set<string>(["test-user-1"]),
    });
    findLimitFollowupRecipientsMock.mockResolvedValue([]);
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "test-user-1",
          email: "samicodesit@gmail.com",
          subscription_status: "free",
          subscription_tier: "free",
          email_subscribed: true,
          unsubscribe_token: "unsub-test",
          free_lifetime_generations_used: 5,
          pack_credits: 0,
        },
        error: null,
      }),
    });

    const handlerModule = await import(
      "../../../api/user/limit-followup-offer.js"
    );
    const handler = handlerModule.default as unknown as (
      req: unknown,
      res: unknown,
    ) => Promise<unknown>;

    const req = {
      method: "GET",
      headers: {
        authorization: "Bearer access-token",
        origin: "https://www.vinted.fr",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      eligible: true,
      couponCode: "LISTFASTER20",
      pricingUrl: "https://autolister.app/pricing?offer=test-token",
    });
  });

  it("does not show the on-page offer when a capped free user still has pack credits", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "test-user-1", email: "samicodesit@gmail.com" } },
      error: null,
    });
    getAllLimitFollowupExclusionsMock.mockResolvedValue({
      excludedEmails: new Set<string>(["samicodesit@gmail.com"]),
      excludedUserIds: new Set<string>(["test-user-1"]),
    });
    findLimitFollowupRecipientsMock.mockResolvedValue([]);
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "test-user-1",
          email: "samicodesit@gmail.com",
          subscription_status: "free",
          subscription_tier: "free",
          email_subscribed: true,
          unsubscribe_token: "unsub-test",
          free_lifetime_generations_used: 5,
          pack_credits: 1,
        },
        error: null,
      }),
    });

    const handlerModule = await import(
      "../../../api/user/limit-followup-offer.js"
    );
    const handler = handlerModule.default as unknown as (
      req: unknown,
      res: unknown,
    ) => Promise<unknown>;

    const req = {
      method: "GET",
      headers: {
        authorization: "Bearer access-token",
        origin: "https://www.vinted.fr",
      },
    };
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ eligible: false });
  });
});
