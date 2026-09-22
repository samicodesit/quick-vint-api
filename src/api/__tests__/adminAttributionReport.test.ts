import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from },
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {};
  }),
}));

import handler from "../../../api/admin/index";

function queryResult(result: unknown) {
  const query: any = {};
  for (const method of [
    "select",
    "range",
    "gte",
    "lte",
    "order",
    "in",
    "eq",
    "limit",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

function createRequest(authorization = "Bearer secret") {
  return {
    method: "GET",
    query: { action: "attribution-report", days: "30" },
    headers: { authorization },
  } as any;
}

describe("GET /api/admin?action=attribution-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = "secret";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns separate TikTok signup, activation, non-new, and current-paid counts", async () => {
    from.mockImplementation((table: string) => {
      if (table === "user_attributions") {
        return queryResult({
          data: [
            {
              user_id: "new-user",
              source: "tiktok",
              medium: "organic_social",
              campaign: "profile",
              content: null,
              captured_at: "2026-09-22T08:55:00.000Z",
              claimed_at: "2026-09-22T09:05:00.000Z",
            },
            {
              user_id: "existing-user",
              source: "tiktok",
              medium: "organic_social",
              campaign: "profile",
              content: null,
              captured_at: "2026-09-22T08:55:00.000Z",
              claimed_at: "2026-09-22T09:05:00.000Z",
            },
          ],
          error: null,
        });
      }
      if (table === "profiles") {
        return queryResult({
          data: [
            {
              id: "new-user",
              created_at: "2026-09-22T09:00:00.000Z",
              subscription_status: "active",
              subscription_tier: "starter",
            },
            {
              id: "existing-user",
              created_at: "2026-09-01T09:00:00.000Z",
              subscription_status: "free",
              subscription_tier: "free",
            },
            {
              id: "unknown-user",
              created_at: "2026-09-22T10:00:00.000Z",
              subscription_status: "free",
              subscription_tier: "free",
            },
          ],
          error: null,
        });
      }
      return queryResult({
        data: [
          {
            user_id: "new-user",
            endpoint: "/api/generate",
            response_status: 200,
            created_at: "2026-09-22T09:10:00.000Z",
          },
        ],
        error: null,
      });
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    const response = createResponse();
    await handler(createRequest(), response as any);

    expect(response.statusCode).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.tiktok).toMatchObject({
      captured: 2,
      newSignups: 1,
      activated: 1,
      nonNewClaims: 1,
      activePaidProfiles: 1,
    });
    expect(response.body.tiktok.paid).toBeUndefined();
    expect(response.body.tiktok.repeat).toBeUndefined();
    expect(response.body.unknown).toEqual({
      profiles: 1,
      crossDeviceUnobservable: true,
    });
    expect(response.body.measurement).toMatchObject({
      userLevel: "authenticated_client_claim",
      platformVerified: false,
      platformProof: "not_connected",
    });
    expect(JSON.stringify(response.body)).not.toContain("@example.com");
  });

  it("returns unavailable when the attribution schema is not installed", async () => {
    from.mockReturnValue(
      queryResult({
        data: null,
        error: {
          code: "PGRST205",
          message:
            "Could not find the table 'public.user_attributions' in the schema cache",
        },
      }),
    );

    const response = createResponse();
    await handler(createRequest(), response as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      available: false,
      status: "unavailable",
      reason: "attribution_schema_unavailable",
    });
    expect(response.body.tiktok).toBeUndefined();
    expect(response.body.message).toContain("not been installed");
  });

  it("keeps the existing admin authentication boundary", async () => {
    const response = createResponse();
    await handler(createRequest("Bearer wrong"), response as any);

    expect(response.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
