import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const update = vi.fn();
const logRequest = vi.fn();
const recipient = {
  id: "controlled-user",
  email: "controlled@example.test",
  unsubscribe_token: "controlled-unsub",
  email_subscribed: true,
  review_request_sent_at: null,
  limitHitAt: "2026-10-19T10:00:00Z",
};
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send } };
  }),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: () => {
      const q: any = {
        select: () => q,
        in: () => q,
        eq: () => q,
        not: () => q,
        update: (...args: any[]) => {
          update(...args);
          return q;
        },
        then: (resolve: any) => resolve({ data: [recipient], error: null }),
      };
      return q;
    },
  },
}));
vi.mock("../../../utils/apiLogger", () => ({ ApiLogger: { logRequest } }));
vi.mock("../../../utils/limitFollowupEligibility", () => ({
  LIMIT_FOLLOWUP_COUPON_CODE: "CONTROLLED",
  normalizeEmailForCampaign: (value: string) => value,
  getAllLimitFollowupExclusions: async () => ({
    excludedEmails: new Set(),
    excludedUserIds: new Set(),
  }),
  findLimitFollowupRecipients: async () => [recipient],
}));
vi.mock("../../../utils/pricingOfferToken", () => ({
  createPricingOfferUrl: () =>
    "https://autolister.app/pricing?offer=controlled",
}));
const response = () => {
  const r: any = {
    code: 200,
    body: null,
    status: (code: number) => {
      r.code = code;
      return r;
    },
    json: (body: any) => {
      r.body = body;
      return r;
    },
  };
  return r;
};

describe("admin outbound provider acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = "controlled-admin";
    send.mockResolvedValue({ data: { id: "controlled-email" }, error: null });
  });
  for (const path of [
    "campaign-test",
    "campaign-real",
    "limit-test",
    "limit-real",
  ]) {
    it(`${path} records a provider-accepted send`, async () => {
      const { default: handler }: { default: any } =
        await import("../../../api/admin/index.js");
      const campaign = path.startsWith("campaign"),
        single = path.endsWith("test");
      const res = response();
      await handler(
        {
          method: "POST",
          query: { action: campaign ? "send-campaign" : "send-limit-followup" },
          headers: {
            authorization: "Bearer controlled-admin",
            host: "localhost",
          },
          body: {
            template_key: "honest_review_request_v1",
            ...(single
              ? { test_email: recipient.email }
              : campaign
                ? { recipient_emails: [recipient.email] }
                : { dry_run: false }),
          },
        } as any,
        res,
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(res.code).toBe(200);
      if (!single) expect(res.body).toMatchObject({ sent: 1, failed: 0 });
      if (path === "campaign-real") expect(update).toHaveBeenCalledTimes(1);
      if (path === "limit-real") expect(logRequest).toHaveBeenCalledTimes(1);
    });
    for (const failure of ["provider-error", "missing-id"]) {
      it(`${path} does not mark ${failure} as sent`, async () => {
        send.mockResolvedValue(
          failure === "provider-error"
            ? {
                data: null,
                error: { message: "Controlled provider rejection" },
              }
            : { data: {}, error: null },
        );
        const { default: handler }: { default: any } =
          await import("../../../api/admin/index.js");
        const campaign = path.startsWith("campaign"),
          single = path.endsWith("test");
        const res = response();
        await handler(
          {
            method: "POST",
            query: {
              action: campaign ? "send-campaign" : "send-limit-followup",
            },
            headers: {
              authorization: "Bearer controlled-admin",
              host: "localhost",
            },
            body: {
              template_key: "honest_review_request_v1",
              ...(single
                ? { test_email: recipient.email }
                : campaign
                  ? { recipient_emails: [recipient.email] }
                  : { dry_run: false }),
            },
          } as any,
          res,
        );
        expect(send).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
        expect(logRequest).not.toHaveBeenCalled();
        if (single) expect(res.code).toBe(500);
        else
          expect(res.body).toMatchObject({
            sent: 0,
            failed: 1,
            results: [{ status: "failed" }],
          });
      });
    }
  }
});
