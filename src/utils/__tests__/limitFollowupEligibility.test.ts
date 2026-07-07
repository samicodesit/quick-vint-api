import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: fromMock,
  },
}));

import {
  LIMIT_FOLLOWUP_EMAIL_SENT_EVENT,
  LIMIT_FOLLOWUP_EXCLUSION_EVENT,
  findLimitFollowupRecipients,
  getAllLimitFollowupExclusions,
} from "../../../utils/limitFollowupEligibility";

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

function mockSupabaseResult(result: QueryResult) {
  const query: Record<string, any> = {};
  for (const method of [
    "select",
    "eq",
    "gte",
    "lte",
    "in",
    "not",
    "order",
    "limit",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason?: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function queueSupabaseResults(results: QueryResult[]) {
  fromMock.mockImplementation(() => {
    const result = results.shift();
    if (!result) throw new Error("Unexpected Supabase query");
    return mockSupabaseResult(result);
  });
}

describe("limit follow-up eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));
  });

  it("treats already sent follow-up emails as campaign exclusions", async () => {
    queueSupabaseResults([
      {
        data: [
          {
            user_id: "user-1",
            user_email: "Seller@Example.com",
            endpoint: LIMIT_FOLLOWUP_EMAIL_SENT_EVENT,
            full_request_body: { event: "limit_followup_email_sent" },
            created_at: "2026-07-01T10:00:00.000Z",
          },
          {
            user_id: "user-2",
            user_email: null,
            endpoint: LIMIT_FOLLOWUP_EXCLUSION_EVENT,
            full_request_body: {
              event: "limit_followup_email_excluded",
              context: { email: "manual@example.com" },
            },
            created_at: "2026-07-01T11:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);

    const exclusions = await getAllLimitFollowupExclusions([]);

    expect(exclusions.excludedUserIds).toEqual(new Set(["user-1", "user-2"]));
    expect(exclusions.excludedEmails).toEqual(
      new Set([
        "samicodesit@gmail.com",
        "seller@example.com",
        "manual@example.com",
      ]),
    );
  });

  it("does not re-include a user who hits the limit again after a follow-up email", async () => {
    queueSupabaseResults([
      {
        data: [
          {
            user_id: "user-1",
            user_email: "seller@example.com",
            endpoint: "/event/generate_limit_hit",
            full_request_body: {
              event: "generate_limit_hit",
              context: { code: "free_lifetime_limit", limit: 5, used: 5 },
            },
            created_at: "2026-07-07T11:00:00.000Z",
          },
        ],
        error: null,
      },
      { data: [], error: null },
      {
        data: [
          {
            user_id: "user-1",
            endpoint: LIMIT_FOLLOWUP_EMAIL_SENT_EVENT,
            full_request_body: { event: "limit_followup_email_sent" },
            created_at: "2026-07-07T09:00:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "user-1",
            email: "seller@example.com",
            subscription_status: "free",
            subscription_tier: "free",
            email_subscribed: true,
            unsubscribe_token: "unsub-1",
            pack_credits: 0,
          },
        ],
        error: null,
      },
    ]);

    const recipients = await findLimitFollowupRecipients({
      sinceHours: 168,
      minDelayMinutes: 0,
      excludedEmails: new Set(),
      excludedUserIds: new Set(),
    });

    expect(recipients).toEqual([]);
  });
});
