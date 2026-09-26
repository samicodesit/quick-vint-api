import { describe, expect, it } from "vitest";
import type { ConfirmedFacts } from "../../../src/ops/contracts/listings";
import {
  listingIssues,
  renderListing,
} from "../../../utils/ops/listings/render";

const facts: ConfirmedFacts = {
  brand: "Levi's",
  model: null,
  category: "jeans",
  size: "W30",
  colour: "blue",
  material: "cotton",
  condition: "good",
  measurements: [{ label: "waist", value: 76, unit: "cm" }],
  defects: ["small scuff at hem"],
};

describe("T08 deterministic listing copy", () => {
  it.each(["en", "nl", "fr", "de", "pl", "es", "it"] as const)(
    "preserves measurements and defects in %s",
    (locale) => {
      const result = renderListing(facts, { locale });
      expect(result.title).toContain("W30");
      expect(result.description).toContain("waist 76 cm");
      expect(result.description).toContain("small scuff at hem");
      expect(result.description).not.toContain("null");
    },
  );
  it("does not invent absent facts or overwrite a human description", () => {
    const absent = renderListing(
      {
        ...facts,
        brand: null,
        size: null,
        material: null,
        measurements: [],
        defects: [],
      },
      { locale: "nl" },
    );
    expect(absent.title).not.toContain("Levi's");
    expect(absent.description).not.toContain("cotton");
    expect(absent.description).not.toContain("W30");
    expect(
      renderListing(facts, { locale: "nl" }, "Seller wrote this by hand.")
        .description,
    ).toBe("Seller wrote this by hand.");
  });
  it("refuses unsupported locale and reports the next blocking issue", () => {
    expect(() => renderListing(facts, { locale: "xx" as "nl" })).toThrow();
    expect(
      listingIssues({
        facts: { ...facts, category: null },
        title: "Title",
        description: "Text",
        priceMinor: 200,
        currency: "EUR",
      })[0],
    ).toBe("Confirm a category");
    expect(
      listingIssues({
        facts,
        title: "Title",
        description: "Text",
        priceMinor: 0,
        currency: "EUR",
      }),
    ).toContain("Set a valid price");
  });
});
