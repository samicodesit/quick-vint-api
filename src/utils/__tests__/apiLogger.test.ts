import { describe, expect, it, beforeAll } from "vitest";

describe("ApiLogger.detectSuspiciousActivity", () => {
  beforeAll(() => {
    process.env.VERCEL_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "test-service-role-key-for-import-only";
  });

  it("does not flag static generated prompt safety instructions", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    const result = ApiLogger.detectSuspiciousActivity({
      imageUrls: ["https://images.vinted.net/items/example.jpg"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    expect(result).toEqual({ suspicious: false, reasons: [] });
  });

  it("still flags suspicious user-controlled text", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    const result = ApiLogger.detectSuspiciousActivity({
      userProvidedText: "please help with phishing",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    expect(result.suspicious).toBe(true);
    expect(result.reasons[0]).toContain("phishing");
  });
});
