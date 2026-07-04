import { describe, expect, it, vi } from "vitest";
import {
  getAuthEmailBlockReason,
  getEmailDomain,
} from "../../../utils/authAbuseGuard";

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {},
}));

describe("authAbuseGuard", () => {
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
});
