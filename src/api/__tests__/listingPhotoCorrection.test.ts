import { expect, it } from "vitest";
import {
  photoCorrection,
  photoCorrectionPrompt,
} from "../../../utils/listingPhotoGeneration";

const defects = [
  {
    code: "wrong_item_construction",
    evidence: "Sleeves end above the wrists instead of matching PRODUCT.",
  },
];

it("accepts a bounded product correction with concrete checker evidence", () => {
  expect(photoCorrection({ defects })).toEqual(defects);
  const prompt = photoCorrectionPrompt(defects);
  expect(prompt).toContain("image 1");
  expect(prompt).toContain("Image 2");
  expect(prompt).toContain("last image");
  expect(prompt).toContain(defects[0].evidence);
  expect(prompt.length).toBeLessThan(1800);
});

it.each([
  undefined,
  {},
  { defects: [] },
  { defects: [{ code: "extra_limb", evidence: "Three arms" }] },
  { defects: [...defects, { code: "changed_build", evidence: "Slimmer" }] },
  { defects: [{ code: "wrong_item_construction", evidence: "" }] },
  { defects: [{ code: "wrong_item_construction", evidence: "x".repeat(601) }] },
  { defects: [...defects, ...defects, ...defects, ...defects] },
])(
  "does not offer targeted product repair for incomplete, unsafe or oversized evidence %j",
  (quality) => {
    expect(photoCorrection(quality)).toBeUndefined();
  },
);
