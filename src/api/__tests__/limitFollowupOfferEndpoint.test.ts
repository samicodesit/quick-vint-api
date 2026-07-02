import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
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
  },
}));

vi.mock("../../../utils/pricingOfferToken", () => ({
  createPricingOfferUrl: createPricingOfferUrlMock,
}));

vi.mock("../../../utils/limitFollowupEligibility", () => ({
  LIMIT_FOLLOWUP_COUPON_CODE: "LISTFASTER20",
  findLimitFollowupRecipients: findLimitFollowupRecipientsMock,
  getAllLimitFollowupExclusions: getAllLimitFollowupExclusionsMock,
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
        minDelayMinutes: 30,
        requireExplicitLimitHit: true,
      }),
    );
    expect(res.body).toMatchObject({
      eligible: true,
      couponCode: "LISTFASTER20",
      pricingUrl: "https://autolister.app/pricing?offer=test-token",
    });
  });
});
