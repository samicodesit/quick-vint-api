import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, logRequestMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  logRequestMock: vi.fn(),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    logRequest: logRequestMock,
  },
}));

import { detectAndPauseDuplicateIpAccount } from "../../../utils/duplicateIpAutoPause";

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

function mockSupabaseResult(result: QueryResult) {
  const query: Record<string, any> = {};
  for (const method of [
    "select",
    "eq",
    "neq",
    "gte",
    "in",
    "order",
    "limit",
    "update",
    "or",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => result);
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

const currentFreeProfile = {
  id: "new-user",
  email: "new@example.com",
  subscription_status: "free",
  subscription_tier: "free",
  account_status: "active",
  free_lifetime_generations_used: 0,
};

describe("detectAndPauseDuplicateIpAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-07-11T10:00:00.000Z"));
  });

  it("does not pause private IPs", async () => {
    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "192.168.1.20",
      source: "test",
    });

    expect(result).toEqual({ paused: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("does not pause when the same IP only signed up before", async () => {
    queueSupabaseResults([
      { data: currentFreeProfile, error: null },
      {
        data: [
          {
            user_id: "old-user",
            user_email: "old@example.com",
            endpoint: "/api/auth/magic-link",
            response_status: 200,
            flagged_reason: null,
            created_at: "2026-07-11T09:55:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "old-user",
            email: "old@example.com",
            subscription_status: "free",
            subscription_tier: "free",
            account_status: "active",
            free_lifetime_generations_used: 0,
          },
        ],
        error: null,
      },
    ]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({ paused: false });
    expect(logRequestMock).not.toHaveBeenCalled();
  });

  it("pauses a new free account when the same IP already used the free limit", async () => {
    queueSupabaseResults([
      { data: currentFreeProfile, error: null },
      {
        data: [
          {
            user_id: "old-user",
            user_email: "old@example.com",
            endpoint: "/api/generate",
            response_status: 200,
            flagged_reason: null,
            created_at: "2026-07-11T09:55:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "old-user",
            email: "old@example.com",
            subscription_status: "free",
            subscription_tier: "free",
            account_status: "active",
            free_lifetime_generations_used: 5,
          },
        ],
        error: null,
      },
      { data: { id: "new-user" }, error: null },
    ]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({
      paused: true,
      reason: "duplicate_ip_signup",
    });
    expect(logRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/system/auto-pause-duplicate-ip",
        userId: "new-user",
        userEmail: "new@example.com",
        ipAddress: "203.0.113.9",
        flaggedReason: "duplicate_ip_signup",
        suspiciousActivity: true,
      }),
    );
  });

  it("does not pause when the same IP only matches an internal owner account", async () => {
    queueSupabaseResults([
      { data: currentFreeProfile, error: null },
      {
        data: [
          {
            user_id: "owner-user",
            user_email: "samicodesit@gmail.com",
            endpoint: "/api/generate",
            response_status: 403,
            flagged_reason: "Account paused",
            created_at: "2026-07-11T09:55:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "owner-user",
            email: "samicodesit@gmail.com",
            subscription_status: "free",
            subscription_tier: "free",
            account_status: "paused",
            free_lifetime_generations_used: 5,
          },
        ],
        error: null,
      },
    ]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({ paused: false });
    expect(logRequestMock).not.toHaveBeenCalled();
  });

  it("does not pause the internal owner account", async () => {
    queueSupabaseResults([{ data: currentFreeProfile, error: null }]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "owner-user",
      email: "samicodesit@gmail.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({ paused: false });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it.each(["nadenickovao7@gmail.com", " NADENICKOVAO7@GMAIL.COM "])(
    "does not auto-pause the permanently excluded account %s",
    async (email) => {
      queueSupabaseResults([
        {
          data: [
            { user_id: "old-user", endpoint: "/event/generate_limit_hit" },
          ],
          error: null,
        },
        {
          data: [
            {
              ...currentFreeProfile,
              id: "old-user",
              free_lifetime_generations_used: 5,
            },
          ],
          error: null,
        },
        { data: { id: "new-user" }, error: null },
      ]);
      const result = await detectAndPauseDuplicateIpAccount({
        userId: "excluded-user",
        email,
        ipAddress: "203.0.113.9",
        source: "generate",
        currentProfile: { ...currentFreeProfile, id: "excluded-user", email },
      });

      expect(result).toEqual({ paused: false });
      expect(fromMock).not.toHaveBeenCalled();
      expect(logRequestMock).not.toHaveBeenCalled();
    },
  );

  it("does not pause when the same IP generated but has not used the free limit", async () => {
    queueSupabaseResults([
      { data: currentFreeProfile, error: null },
      {
        data: [
          {
            user_id: "old-user",
            user_email: "old@example.com",
            endpoint: "/api/generate",
            response_status: 200,
            flagged_reason: null,
            created_at: "2026-07-11T09:55:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "old-user",
            email: "old@example.com",
            subscription_status: "free",
            subscription_tier: "free",
            account_status: "active",
            free_lifetime_generations_used: 2,
          },
        ],
        error: null,
      },
    ]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({ paused: false });
  });

  it("pauses a new free account when the same IP belongs to a paused free account", async () => {
    queueSupabaseResults([
      { data: currentFreeProfile, error: null },
      {
        data: [
          {
            user_id: "old-user",
            user_email: "old@example.com",
            endpoint: "/api/generate",
            response_status: 403,
            flagged_reason: "Account paused",
            created_at: "2026-07-11T09:55:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "old-user",
            email: "old@example.com",
            subscription_status: "free",
            subscription_tier: "free",
            account_status: "paused",
            free_lifetime_generations_used: 1,
          },
        ],
        error: null,
      },
      { data: { id: "new-user" }, error: null },
    ]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({
      paused: true,
      reason: "duplicate_ip_signup",
    });
  });

  it("does not pause paid current accounts", async () => {
    queueSupabaseResults([
      {
        data: {
          ...currentFreeProfile,
          subscription_status: "active",
          subscription_tier: "starter",
        },
        error: null,
      },
    ]);

    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
    });

    expect(result).toEqual({ paused: false });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

it.each([
  { pack_credits: 20 },
  { paid_access_expires_at: "2099-01-01T00:00:00.000Z" },
])(
  "does not pause a free-status account with paid access %j",
  async (entitlement) => {
    fromMock.mockReset();
    logRequestMock.mockClear();
    queueSupabaseResults([
      { data: [{ user_id: "old", endpoint: "/event/generate_limit_hit" }] },
      {
        data: [
          {
            ...currentFreeProfile,
            id: "old",
            free_lifetime_generations_used: 5,
          },
        ],
      },
      { data: { id: "new-user" } },
    ]);
    const result = await detectAndPauseDuplicateIpAccount({
      userId: "new-user",
      email: "new@example.com",
      ipAddress: "203.0.113.9",
      source: "test",
      currentProfile: { ...currentFreeProfile, ...entitlement },
    });
    expect(result.paused).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  },
);
it("does not report a pause if a concurrent payment prevents the conditional update", async () => {
  fromMock.mockReset();
  logRequestMock.mockClear();
  queueSupabaseResults([
    { data: [{ user_id: "old", endpoint: "/event/generate_limit_hit" }] },
    {
      data: [
        { ...currentFreeProfile, id: "old", free_lifetime_generations_used: 5 },
      ],
    },
    { data: null, error: null },
  ]);
  const result = await detectAndPauseDuplicateIpAccount({
    userId: "new-user",
    email: "new@example.com",
    ipAddress: "203.0.113.9",
    source: "test",
    currentProfile: currentFreeProfile,
  });
  expect(result.paused).toBe(false);
  expect(logRequestMock).not.toHaveBeenCalled();
  const update = fromMock.mock.results[2].value;
  expect(update.or).toHaveBeenCalledWith(
    "subscription_status.is.null,subscription_status.not.in.(active,trialing,canceling,past_due)",
  );
  expect(update.or).toHaveBeenCalledWith(
    "pack_credits.is.null,pack_credits.lte.0",
  );
  expect(update.or).toHaveBeenCalledWith(
    expect.stringContaining(
      "paid_access_expires_at.is.null,paid_access_expires_at.lte.",
    ),
  );
});
