export const PHOTO_DEFECT_CODES = [
  "extra_limb",
  "broken_limb_or_grip",
  "wrong_phone_side",
  "recognizable_face",
  "wrong_view",
  "collage_or_extra_person",
  "item_clipped",
  "wrong_item_color",
  "invented_decoration",
  "wrong_item_construction",
  "unrelated_accessory",
  "changed_build",
  "wrong_framing",
  "item_detail_unverifiable",
] as const;

const comparisons = {
  shape:
    "Compare silhouette, cut, sleeve endpoints and hem/leg proportions to PRODUCT, allowing normal drape and model height.",
  construction:
    "Compare main pocket structure, fastenings and handles to PRODUCT. Minor stitching and tiny hardware rendering differences are acceptable; major missing or redesigned features are not.",
  decoration:
    "Compare overall color, pattern and prominent graphics on the target surface. Do not copy opposite-side decoration. Ignore tiny lettering and small logo-rendering variations when the main design is retained.",
};
type ComparisonKey = keyof typeof comparisons;
type Comparison = {
  product: string;
  candidate: string;
  verdict: "match" | "mismatch" | "unverifiable";
};
export interface PhotoQuality {
  defects: { code: string; evidence: string }[];
  productComparison?: Record<ComparisonKey, Comparison>;
}
export const PRODUCT_COMPARISON_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(
    Object.entries(comparisons).map(([key, description]) => [
      key,
      {
        type: "object",
        description,
        properties: {
          product: {
            type: "string",
            description:
              "Concrete visible PRODUCT evidence, at most 240 characters.",
          },
          candidate: {
            type: "string",
            description:
              "Corresponding visible CANDIDATE evidence, at most 240 characters.",
          },
          verdict: {
            type: "string",
            enum: ["match", "mismatch", "unverifiable"],
          },
        },
        required: ["product", "candidate", "verdict"],
        additionalProperties: false,
      },
    ]),
  ),
  required: Object.keys(comparisons),
  additionalProperties: false,
};

export function parsePhotoQuality(
  text: string,
  requireComparison: boolean,
): PhotoQuality {
  const quality = JSON.parse(text);
  if (
    !Array.isArray(quality?.defects) ||
    quality.defects.some(
      (d: any) =>
        !d ||
        !PHOTO_DEFECT_CODES.includes(d.code) ||
        typeof d.evidence !== "string" ||
        !d.evidence.trim(),
    )
  )
    throw new Error("invalid_photo_check");
  if (!requireComparison) return quality;
  const observed = quality.productComparison;
  if (!observed || typeof observed !== "object" || Array.isArray(observed))
    throw new Error("invalid_photo_check");
  const defects = [...quality.defects];
  for (const key of Object.keys(comparisons) as ComparisonKey[]) {
    const row = observed[key];
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      [row.product, row.candidate].some(
        (value) =>
          typeof value !== "string" || !value.trim() || value.length > 240,
      ) ||
      !["match", "mismatch", "unverifiable"].includes(row.verdict)
    )
      throw new Error("invalid_photo_check");
    if (row.verdict === "match") continue;
    // A contradictory empty defects list cannot turn failed evidence into a pass.
    const code =
      row.verdict === "unverifiable"
        ? "item_detail_unverifiable"
        : key === "decoration"
          ? "invented_decoration"
          : "wrong_item_construction";
    const evidence = `PRODUCT: ${row.product} CANDIDATE: ${row.candidate}`;
    if (!defects.some((d) => d.code === code && d.evidence === evidence))
      defects.push({ code, evidence });
  }
  const consolidated: PhotoQuality["defects"] = [];
  for (const defect of defects) {
    const existing = consolidated.find((d) => d.code === defect.code);
    if (!existing) consolidated.push({ ...defect });
    else if (!existing.evidence.includes(defect.evidence))
      existing.evidence += "\n" + defect.evidence;
  }
  return { ...quality, defects: consolidated };
}
