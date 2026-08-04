import { describe, expect, it } from "vitest";
import { SITE_EXTRA_COPY } from "../site.js";

describe("homepage tier proof", () => {
  it("provides standard-price proof for every homepage locale", () => {
    for (const [locale, { home }] of Object.entries(SITE_EXTRA_COPY)) {
      expect(home, `${locale} home copy`).toHaveProperty("tierProof");

      const proof = (
        home as typeof home & {
          tierProof?: {
            chooseTier: string;
            noCardRequired: string;
            tiers: Record<
              "starter" | "pro" | "business",
              {
                priceValue: string;
                comparisonValue: string;
                listingsValue: string;
                speedValue: string;
              }
            >;
          };
        }
      ).tierProof;

      expect(proof?.chooseTier.length).toBeGreaterThan(4);
      expect(proof?.noCardRequired.length).toBeGreaterThan(8);
      expect(proof?.tiers.starter.priceValue).toMatch(/3[.,]99/);
      expect(proof?.tiers.pro.priceValue).toMatch(/9[.,]99/);
      expect(proof?.tiers.business.priceValue).toMatch(/19[.,]99/);
      expect(proof?.tiers.starter.listingsValue).toContain("75");
      expect(proof?.tiers.pro.listingsValue).toContain("250");
      expect(proof?.tiers.business.listingsValue).toContain("600");
      expect(proof?.tiers.business.comparisonValue).not.toMatch(
        /cheaper|moins|günstiger|goedkoper|taniej|barat|più economico/i,
      );
    }
  });
});
