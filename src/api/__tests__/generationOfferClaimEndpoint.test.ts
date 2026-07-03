import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const claimGenerationOfferMock = vi.fn();
const reportCriticalEndpointFailureMock = vi.fn();

vi.mock("cors", () => ({
  default: vi.fn(
    () => (_req: unknown, _res: unknown, callback: (err?: unknown) => void) =>
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

vi.mock("../../../utils/generationOffers", () => ({
  claimGenerationOffer: claimGenerationOfferMock,
}));

vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: reportCriticalEndpointFailureMock,
}));

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: any) => {
      response.body = body;
      return response;
    }),
    end: vi.fn(() => response),
  };
  return response;
}

describe("generation offer claim endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "seller@example.com" } },
      error: null,
    });
  });

  it("alerts on server-side claim failures", async () => {
    claimGenerationOfferMock.mockResolvedValue({
      ok: false,
      status: 500,
      body: { error: "Could not claim this offer. Please try again." },
    });

    const handlerModule =
      await import("../../../api/user/generation-offers/claim.js");
    const handler = handlerModule.default as any;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer access-token",
          origin: "https://www.vinted.fr",
        },
        body: { offerId: "offer-1" },
      },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(reportCriticalEndpointFailureMock).toHaveBeenCalledWith({
      endpoint: "/api/user/generation-offers/claim",
      status: 500,
      userId: "user-1",
      details: {
        offerId: "offer-1",
        response: { error: "Could not claim this offer. Please try again." },
      },
    });
  });

  it("does not alert on successful claims", async () => {
    claimGenerationOfferMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: { ok: true, offerId: "offer-1", packCredits: 1 },
    });

    const handlerModule =
      await import("../../../api/user/generation-offers/claim.js");
    const handler = handlerModule.default as any;
    const res = createResponse();

    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer access-token",
          origin: "https://www.vinted.fr",
        },
        body: { offerId: "offer-1" },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(reportCriticalEndpointFailureMock).not.toHaveBeenCalled();
  });
});
