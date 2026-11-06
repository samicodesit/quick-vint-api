import { afterEach, expect, it, vi } from "vitest";
import {
  checkListingPhoto,
  classifyListingPhotos,
  parsePhotoPlan,
  photoCorrection,
  photoCorrectionPrompt,
  photoEditReferenceIndices,
  photoPrompt,
  photoReferenceIndices,
} from "../../../utils/listingPhotoGeneration";

afterEach(() => vi.unstubAllGlobals());
const plan = {
  eligible: true,
  category: "bottom",
  itemType: "trousers" as const,
  frontIndex: 0,
  backIndex: 2,
  detailIndex: 8,
  backViewEvidence: "separate_photo" as const,
  viewDetails: { front: 3, rear: 6 },
};
const sourceEvidence = {
  shape: "Full-length straight jeans with slight flare and stitched hems.",
  front: "Button, fly and curved front pockets.",
  rear: "Zippers above nested pentagonal rear pockets, without W stitching.",
};
const matched = {
  shape: {
    product: "Full length trousers",
    candidate: "Full length trousers",
    verdict: "match",
  },
  construction: {
    product: "Rear zips above nested pockets",
    candidate: "Rear zips above nested pockets",
    verdict: "match",
  },
  decoration: {
    product: "Plain denim",
    candidate: "Plain denim",
    verdict: "match",
  },
};
function provider(quality: unknown) {
  process.env.VERCEL_APP_OPENAI_API_KEY = "test";
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(quality) }] },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const check = () =>
  checkListingPhoto(
    "model",
    Buffer.from("candidate"),
    plan,
    "secondary",
    false,
    ["rear", "pocket-closeup", "label", "front"],
  );

it("keeps the per-view construction close-up ahead of shared evidence", () => {
  expect(photoReferenceIndices(plan, "primary")).toEqual([0, 3, 8, 2]);
  expect(photoReferenceIndices(plan, "secondary")).toEqual([2, 6, 8, 0]);
  expect(photoEditReferenceIndices(plan, "secondary")).toContain(6);
  expect(parsePhotoPlan(JSON.stringify(plan), 10)).toEqual(plan);
});
it("preserves old jobs and deduplicates shared construction references", () => {
  expect(
    photoReferenceIndices({ ...plan, viewDetails: undefined }, "secondary"),
  ).toEqual([2, 0, 8]);
  expect(
    photoReferenceIndices({ ...plan, detailIndex: 6 }, "secondary"),
  ).toEqual([2, 6, 0]);
});
it("uses the same evidenced front detail for a second front variation", () => {
  const frontOnly = {
    ...plan,
    backIndex: -1,
    backViewEvidence: "absent" as const,
    viewDetails: { front: 3, rear: -1 },
  };
  expect(photoReferenceIndices(frontOnly, "secondary")).toEqual([0, 3, 8]);
});
it.each([
  { front: 10, rear: 6 },
  { front: 3, rear: -2 },
  { front: 3.5, rear: 6 },
  { front: 3 },
  null,
  [],
])("rejects malformed per-view indices %j", (viewDetails) => {
  expect(() =>
    parsePhotoPlan(JSON.stringify({ ...plan, viewDetails }), 10),
  ).toThrow("invalid_photo_plan");
});
it("does not accept an asserted rear detail without an evidenced rear surface", () => {
  expect(() =>
    parsePhotoPlan(
      JSON.stringify({ ...plan, backIndex: -1, backViewEvidence: "absent" }),
      10,
    ),
  ).toThrow("invalid_photo_plan");
});
it("preserves plain-back isolation without discarding its construction close-up", () => {
  const plainBack = {
    ...plan,
    construction: {
      sleeveLength: "unknown" as const,
      legLength: "full_length" as const,
      frontDecoration: "decorated" as const,
      backDecoration: "plain" as const,
    },
  };
  expect(photoEditReferenceIndices(plainBack, "secondary")).toEqual([2, 6, 8]);
  expect(photoReferenceIndices(plainBack, "secondary")).toEqual([2, 6, 8, 0]);
});
it("asks the existing classification call for bounded front and rear details", async () => {
  const fetcher = provider({ ...plan, sourceEvidence });
  await classifyListingPhotos(
    Array.from({ length: 10 }, (_, i) => "source" + i),
  );
  const schema = JSON.parse(fetcher.mock.calls[0][1].body).text.format.schema;
  expect(schema.required).toContain("viewDetails");
  expect(schema.properties.viewDetails.properties.rear.enum).toEqual([
    -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("records source-only evidence before selection without an extra API call", async () => {
  const fetcher = provider({ ...plan, sourceEvidence });
  const sources = Array.from({ length: 10 }, (_, i) => "original" + i);
  const result = await classifyListingPhotos(sources);
  expect(result.plan.sourceEvidence).toEqual(sourceEvidence);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(Object.keys(body.text.format.schema.properties)[0]).toBe(
    "sourceEvidence",
  );
  expect(
    body.input[0].content
      .filter((p: any) => p.type === "input_image")
      .map((p: any) => p.image_url),
  ).toEqual(sources);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("requires source-only evidence for new classifications but supports saved legacy jobs", async () => {
  provider(plan);
  await expect(
    classifyListingPhotos(Array.from({ length: 10 }, () => "source")),
  ).rejects.toThrow("invalid_photo_plan");
  expect(parsePhotoPlan(JSON.stringify(plan), 10)).toEqual(plan);
});
it.each([
  null,
  [],
  {},
  { ...sourceEvidence, shape: "" },
  { ...sourceEvidence, rear: "x".repeat(321) },
])("rejects malformed source observations %j", (sourceEvidence) => {
  expect(() =>
    parsePhotoPlan(JSON.stringify({ ...plan, sourceEvidence }), 10),
  ).toThrow("invalid_photo_plan");
});
it("shares source-only facts with generation, correction and checking without copying the opposite surface", async () => {
  const grounded = { ...plan, sourceEvidence };
  const correction = [
    { code: "wrong_item_construction", evidence: "Missing pocket zips" },
  ];
  for (const prompt of [
    photoPrompt(grounded, "secondary"),
    photoCorrectionPrompt(correction, grounded, "secondary"),
  ]) {
    expect(prompt).toContain(sourceEvidence.shape);
    expect(prompt).toContain(sourceEvidence.rear);
    expect(prompt).not.toContain(sourceEvidence.front);
  }
  const fetcher = provider({ defects: [], productComparison: matched });
  await checkListingPhoto(
    "pose",
    Buffer.from("candidate"),
    grounded,
    "secondary",
    false,
    ["rear", "detail"],
  );
  const prompt = JSON.parse(fetcher.mock.calls[0][1].body).input[0].content[0]
    .text;
  expect(prompt).toContain(sourceEvidence.rear);
  expect(prompt).toContain("faint seams");
});
it("consolidates repeated defect codes while retaining distinct observed evidence", async () => {
  provider({
    defects: [{ code: "wrong_item_construction", evidence: "Missing zips" }],
    productComparison: {
      ...matched,
      construction: {
        product: "Zipped nested pockets",
        candidate: "Plain patch pockets",
        verdict: "mismatch",
      },
    },
  });
  const result = await check();
  expect(result.quality.defects).toHaveLength(1);
  expect(result.quality.defects[0].evidence).toContain("Missing zips");
  expect(result.quality.defects[0].evidence).toContain("Plain patch pockets");
  expect(photoCorrection(result.quality)).toBeDefined();
});
it("does not silently treat a malformed new classification as a legacy saved plan", async () => {
  provider({ ...plan, viewDetails: undefined });
  await expect(
    classifyListingPhotos(Array.from({ length: 10 }, (_, i) => "source" + i)),
  ).rejects.toThrow("invalid_photo_plan");
});
it("cannot accept missing product evidence just because defects is empty", async () => {
  provider({ defects: [] });
  await expect(check()).rejects.toThrow("invalid_photo_check");
});
it("rejects mismatched construction even when the model returns no defects", async () => {
  const fetcher = provider({
    defects: [],
    productComparison: {
      ...matched,
      construction: {
        product: "Rear zips above nested pockets",
        candidate: "Plain patch pockets without zips",
        verdict: "mismatch",
      },
    },
  });
  const result = await check();
  expect(result.accepted).toBe(false);
  expect(result.quality.defects).toContainEqual({
    code: "wrong_item_construction",
    evidence: expect.stringContaining("without zips"),
  });
  expect(photoCorrection(result.quality)).toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps unverifiable detail out of targeted correction", async () => {
  provider({
    defects: [],
    productComparison: {
      ...matched,
      construction: {
        product: "Visible rear zips",
        candidate: "Pockets too small to assess",
        verdict: "unverifiable",
      },
    },
  });
  const result = await check();
  expect(result.accepted).toBe(false);
  expect(photoCorrection(result.quality)).toBeUndefined();
});
it.each([
  undefined,
  null,
  [],
  {
    ...matched,
    construction: { product: "", candidate: "plain", verdict: "match" },
  },
  { ...matched, shape: { ...matched.shape, verdict: "probably" } },
])("rejects malformed comparisons %j", async (productComparison) => {
  provider({ defects: [], productComparison });
  await expect(check()).rejects.toThrow("invalid_photo_check");
});
it("accepts concrete matching evidence and retains it for review", async () => {
  const fetcher = provider({ defects: [], productComparison: matched });
  const result = await check();
  expect(result.accepted).toBe(true);
  expect(result.quality.productComparison).toEqual(matched);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.text.format.schema.required).toContain("productComparison");
  expect(Object.keys(body.text.format.schema.properties)).toEqual([
    "productComparison",
    "defects",
  ]);
  expect(
    body.input[0].content
      .filter((p: any) => p.type === "input_image")
      .map((p: any) => p.image_url),
  ).toEqual([
    "model",
    expect.any(String),
    "rear",
    "pocket-closeup",
    "label",
    "front",
  ]);
});
it("leaves the rear-pose checker independent of sale-item evidence", async () => {
  const fetcher = provider({ defects: [] });
  const result = await checkListingPhoto(
    "model",
    Buffer.from("rear"),
    plan,
    "secondary",
    true,
  );
  expect(result.accepted).toBe(true);
  expect(
    JSON.parse(fetcher.mock.calls[0][1].body).text.format.schema.required,
  ).toEqual(["defects"]);
  expect(
    JSON.parse(fetcher.mock.calls[0][1].body).text.format.schema.properties
      .defects.items.properties.code.enum,
  ).not.toContain("wrong_framing");
});
it("requests an item-focused crop but checks usable visibility rather than exact composition", async () => {
  const shoes = { ...plan, category: "shoes", itemType: "shoes" as const };
  const crop = "Crop below knees through floor";
  const correction = [
    { code: "wrong_item_color", evidence: "Wrong shoe color" },
  ];
  expect(photoPrompt(shoes, "primary")).toContain(crop);
  expect(photoCorrectionPrompt(correction, shoes, "primary")).toContain(crop);
  const fetcher = provider({ defects: [], productComparison: matched });
  await checkListingPhoto(
    "model",
    Buffer.from("candidate"),
    shoes,
    "primary",
    false,
    ["product"],
  );
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.input[0].content[0].text).not.toContain(crop);
  expect(body.input[0].content[0].text).toContain("large enough to inspect");
  expect(body.input[0].content[0].text).not.toContain(
    "require a below-knee crop",
  );
  expect(body.input[0].content[0].text).toContain("usable resale photo");
  expect(body.service_tier).toBe("default");
  expect(body.input[0].content[0].text).toContain(
    "Extra visible body or background alone is not a defect",
  );
  expect(body.input[0].content[0].text).not.toContain(
    "Wider framing is acceptable",
  );
  expect(
    body.text.format.schema.properties.defects.items.properties.code.enum,
  ).toContain("wrong_framing");
});
it("removes base trousers for a dress while keeping coat layering", () => {
  const dress = { ...plan, category: "full_body", itemType: "dress" as const };
  expect(photoPrompt(dress, "primary")).toContain(
    "Remove the base top and trousers",
  );
  expect(
    photoCorrectionPrompt(
      [{ code: "wrong_item_construction", evidence: "Short sleeves" }],
      dress,
      "secondary",
    ),
  ).toContain("Remove the base top and trousers");
  expect(
    photoPrompt({ ...dress, itemType: "long_coat" }, "primary"),
  ).not.toContain("Remove the base top and trousers");
});
