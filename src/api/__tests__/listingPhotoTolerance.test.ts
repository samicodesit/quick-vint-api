import { expect, it } from "vitest";
import { parsePhotoQuality } from "../../../utils/listingPhotoQuality";
const comparison = {
  shape: { product: "Blue jacket", candidate: "Blue jacket", verdict: "match" },
  construction: {
    product: "Small zipper pull",
    candidate: "Slightly different zipper pull",
    verdict: "minor_difference",
  },
  decoration: {
    product: "Plain blue",
    candidate: "Plain blue",
    verdict: "match",
  },
};
it("accepts a usable sale item despite small accessories and phone orientation", () => {
  const quality = parsePhotoQuality(
    JSON.stringify({
      defects: [
        { code: "unrelated_accessory", evidence: "Small added necklace" },
        { code: "wrong_phone_side", evidence: "Phone screen visible" },
      ],
      productComparison: comparison,
    }),
    true,
  );
  expect(quality.defects).toEqual([]);
  expect(quality.observations).toHaveLength(2);
});
it("still rejects material garment changes alongside incidental observations", () => {
  const quality = parsePhotoQuality(
    JSON.stringify({
      defects: [{ code: "unrelated_accessory", evidence: "Small necklace" }],
      productComparison: {
        ...comparison,
        shape: {
          product: "Long sleeves",
          candidate: "Short sleeves",
          verdict: "mismatch",
        },
      },
    }),
    true,
  );
  expect(quality.defects.map((d) => d.code)).toContain(
    "wrong_item_construction",
  );
});
