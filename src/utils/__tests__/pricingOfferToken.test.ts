import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createPricingOfferToken,
  createPricingOfferUrl,
  verifyPricingOfferToken,
} from "../../../utils/pricingOfferToken";

describe("pricing offer tokens", () => {
  const originalSecret = process.env.PRICING_OFFER_TOKEN_SECRET;
  const originalAdminSecret = process.env.ADMIN_SECRET;

  beforeEach(() => {
    process.env.PRICING_OFFER_TOKEN_SECRET = "test-offer-secret";
    delete process.env.ADMIN_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.PRICING_OFFER_TOKEN_SECRET;
    } else {
      process.env.PRICING_OFFER_TOKEN_SECRET = originalSecret;
    }

    if (originalAdminSecret === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalAdminSecret;
    }
  });

  it("creates and verifies an unexpired offer token", () => {
    const token = createPricingOfferToken({
      email: "Charlotte.Lefevre.1807@hotmail.com",
      targetTier: "pro",
      couponCode: "L1ST3R50",
      expiresAt: "2099-07-05T21:59:00.000Z",
      issuedAt: "2026-07-01T12:00:00.000Z",
    });

    expect(verifyPricingOfferToken(token)).toMatchObject({
      email: "charlotte.lefevre.1807@hotmail.com",
      targetTier: "pro",
      couponCode: "L1ST3R50",
      source: "pricing_offer_email",
    });
  });

  it("rejects tampered tokens", () => {
    const token = createPricingOfferToken({
      email: "charlotte.lefevre.1807@hotmail.com",
      targetTier: "pro",
      expiresAt: "2099-07-05T21:59:00.000Z",
    });

    expect(() => verifyPricingOfferToken(`${token}x`)).toThrow(
      "Invalid offer token signature",
    );
  });

  it("builds a pricing URL with an offer parameter", () => {
    const url = createPricingOfferUrl(
      {
        email: "charlotte.lefevre.1807@hotmail.com",
        targetTier: "pro",
        expiresAt: "2099-07-05T21:59:00.000Z",
      },
      "https://autolister.app",
    );

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://autolister.app");
    expect(parsed.pathname).toBe("/pricing");
    expect(parsed.searchParams.get("offer")).toBeTruthy();
    expect(parsed.searchParams.get("utm_campaign")).toBe("charlotte_pro_offer");
  });
});
