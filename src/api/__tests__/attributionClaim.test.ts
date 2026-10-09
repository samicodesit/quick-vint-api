import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

import handler, {
  buildAttributionClaimUpdate,
} from "../../../api/attribution/claim";

function createResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("attribution claim payload", () => {
  it("uses the authenticated owner and never accepts a client user id", () => {
    expect(
      buildAttributionClaimUpdate(
        "authenticated-user",
        {
          userId: "attacker-user",
          source: "tiktok",
          medium: "organic_social",
          campaign: "profile",
          capturedAt: "2026-09-22T10:00:00.000Z",
        },
        "2026-09-22T10:05:00.000Z",
      ),
    ).toEqual({
      user_id: "authenticated-user",
      source: "tiktok",
      medium: "organic_social",
      campaign: "profile",
      content: null,
      captured_at: "2026-09-22T10:00:00.000Z",
      referrer_host: null,
      claimed_at: "2026-09-22T10:05:00.000Z",
    });
  });

  it("rejects an invalid claim before database persistence", () => {
    expect(() =>
      buildAttributionClaimUpdate(
        "authenticated-user",
        {
          source: "tiktok",
          medium: "not-a-medium",
          capturedAt: "2026-09-22T10:00:00.000Z",
        },
        "2026-09-22T10:05:00.000Z",
      ),
    ).toThrow("invalid_attribution");
  });
});

describe("attribution claim endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "authenticated-user" } },
      error: null,
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it.each(["tiktok", "x", "newsletter", "unknown"])(
    "persists %s attribution for the bearer owner and ignores a client user id",
    async (source) => {
      const req = {
        method: "POST",
        headers: { authorization: "Bearer access-token" },
        body: {
          attribution: {
            userId: "attacker-user",
            source,
            medium: "organic_social",
            campaign: "profile",
            capturedAt: new Date().toISOString(),
          },
        },
        query: {},
      } as any;
      const res = createResponse();

      await handler(req, res as any);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, alreadyAttributed: false });
      expect(mocks.getUser).toHaveBeenCalledWith("access-token");
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "authenticated-user",
          source,
        }),
      );
      expect(mocks.insert.mock.calls[0][0].user_id).not.toBe("attacker-user");
    },
  );

  it("rejects unauthenticated claims before persistence", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { attribution: { source: "tiktok" } },
      query: {},
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects malformed attribution before persistence", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Bearer access-token" },
      body: {
        attribution: {
          source: "https://evil.example/?email=secret",
          medium: "javascript",
          capturedAt: "not-a-date",
        },
      },
      query: {},
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "invalid_attribution" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("treats a duplicate first-touch claim as an idempotent success", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    const req = {
      method: "POST",
      headers: { authorization: "Bearer access-token" },
      body: {
        attribution: {
          source: "tiktok",
          medium: "organic_social",
          capturedAt: new Date().toISOString(),
        },
      },
      query: {},
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyAttributed: true });
  });
});
