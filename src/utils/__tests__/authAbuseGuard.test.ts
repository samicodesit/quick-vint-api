import { describe, expect, it, vi } from "vitest";
import {
  checkMagicLinkRateLimit,
  getAuthEmailBlockReason,
  getEmailDomain,
} from "../../../utils/authAbuseGuard";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: vi.fn(() => ({ ipAddress: "203.0.113.10" })),
  },
}));

describe("authAbuseGuard", () => {
  function queueAuthAttemptCounts(counts: number[]) {
    fromMock.mockImplementation(() => {
      const count = counts.shift();
      if (typeof count !== "number") {
        throw new Error("Unexpected Supabase count query");
      }

      const query: Record<string, any> = {};
      for (const method of ["select", "eq", "gte"]) {
        query[method] = vi.fn(() => query);
      }
      query.then = (
        resolve: (value: { count: number; error: null }) => unknown,
        reject: (reason?: unknown) => unknown,
      ) => Promise.resolve({ count, error: null }).then(resolve, reject);
      return query;
    });
  }

  it("blocks the active abusive emailos.de domain", () => {
    expect(getAuthEmailBlockReason("seller@emailos.de")).toBe(
      "blocked_email_domain",
    );
    expect(getAuthEmailBlockReason("SELLER@EMAILOS.DE")).toBe(
      "blocked_email_domain",
    );
  });

  it("blocks spam-only local parts without blocking normal addresses", () => {
    expect(getAuthEmailBlockReason("spam@example.com")).toBe("spam_local_part");
    expect(getAuthEmailBlockReason("spam123@example.com")).toBe(
      "spam_local_part",
    );
    expect(getAuthEmailBlockReason("spambuyer@example.com")).toBeNull();
  });

  it("normalizes email domains", () => {
    expect(getEmailDomain(" Buyer@Example.COM ")).toBe("example.com");
  });

  it("allows a third magic-link email request inside the retry window", async () => {
    queueAuthAttemptCounts([2, 2]);

    await expect(
      checkMagicLinkRateLimit({
        req: {} as any,
        email: "buyer@gmail.com",
      }),
    ).resolves.toEqual({ limited: false });
  });

  it("blocks the fifth magic-link email request inside the retry window", async () => {
    queueAuthAttemptCounts([4]);

    await expect(
      checkMagicLinkRateLimit({
        req: {} as any,
        email: "buyer@gmail.com",
      }),
    ).resolves.toEqual({
      limited: true,
      reason: "email_magic_link_rate_limit",
    });
  });
});
