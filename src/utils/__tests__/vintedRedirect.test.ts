import { describe, expect, it } from "vitest";
import {
  getSafeVintedCreateListingUrl,
  getVintedCreateListingUrl,
} from "../../../utils/vintedRedirect.js";

describe("mobile Vinted URL mapping", () => {
  it("returns the approved HTTPS create URL for a supported market", () => {
    expect(getSafeVintedCreateListingUrl("fr")).toBe(
      "https://www.vinted.fr/items/new",
    );
    expect(getSafeVintedCreateListingUrl("GB")).toBe(
      "https://www.vinted.co.uk/items/new",
    );
  });

  it.each(["", "evil", "DEFAULT", "www.vinted.fr", "javascript:alert(1)"])(
    "rejects an unapproved country or host: %s",
    (countryCode) => {
      expect(() => getSafeVintedCreateListingUrl(countryCode)).toThrow(
        "unsupported_country",
      );
    },
  );

  it("keeps the extension helper's historical default fallback unchanged", () => {
    expect(getVintedCreateListingUrl("unknown")).toBe(
      "https://www.vinted.com/items/new",
    );
  });
});
