import { describe, expect, it } from "vitest";
import {
  getPricingDisplay,
  getPricingGuideCopy,
  getPricingTermsCopy,
  getPublicPricingDisplayMode,
} from "../pricingDisplay.js";

describe("public pricing display", () => {
  it("defaults to legacy display mode", () => {
    expect(getPublicPricingDisplayMode()).toBe("legacy");
    expect(getPricingDisplay().limits).toMatchObject({
      freePrimaryValue: "2",
      starterDaily: "15",
      proMonthly: "800",
      businessDaily: "No Daily Limit",
    });
  });

  it("returns current display copy only when explicitly enabled", () => {
    expect(getPublicPricingDisplayMode("current")).toBe("current");
    expect(getPricingDisplay("current").limits).toMatchObject({
      freePrimaryValue: "5",
      freeSecondaryText: "No daily or monthly free reset",
      starterMonthly: "75",
      businessDaily: "60",
    });
    expect(getPricingDisplay("current").creditPack).toMatchObject({
      credits: 20,
      priceLabel: "€5.99",
    });
  });

  it("shares terms and guide copy from the same mode decision", () => {
    expect(getPricingTermsCopy("legacy")).toMatchObject({
      free: "2 listings per day, 8 listings per month",
      business: "No daily limit, 1,500 per month",
    });
    expect(getPricingGuideCopy("current")).toMatchObject({
      freePricingCopy: "5 lifetime AI-generated listings",
      paidPricingCopy: "10/day (Starter), 25/day (Pro), and 60/day (Business)",
    });
  });
});
