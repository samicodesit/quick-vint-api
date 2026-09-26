import { z } from "zod";
import { uuidSchema } from "./core";

export const requestAnalysisSchema = z
  .object({
    itemId: uuidSchema,
    captureRevision: z.number().int().positive(),
    mode: z.enum(["initial", "targeted"]),
  })
  .strict();

export const analysisDetailSchema = z.object({ itemId: uuidSchema }).strict();

const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .refine(
    (v) => v.x + v.width <= 1 && v.y + v.height <= 1,
    "Crop exceeds image bounds",
  );

export const proposalSchema = z
  .object({
    field: z.enum([
      "brand",
      "category",
      "size",
      "colour",
      "material",
      "condition",
      "measurement",
    ]),
    valueText: z.string().trim().min(1).max(200).nullable(),
    valueNumber: z.number().finite().nullable(),
    valueUnit: z.string().trim().min(1).max(30).nullable(),
    reason: z.enum(["visible", "unreadable", "conflicting", "not_observed"]),
    evidenceAssetIds: z.array(uuidSchema).max(8),
    labelText: z.string().max(500).nullable(),
    crop: cropSchema.nullable(),
  })
  .strict();

export const extractionSchema = z
  .object({ proposals: z.array(proposalSchema).max(50) })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;

export const ontology = {
  category: [
    "tops",
    "shirts",
    "knitwear",
    "outerwear",
    "dresses",
    "skirts",
    "trousers",
    "jeans",
    "shorts",
    "shoes",
    "bags",
    "accessories",
    "other",
  ],
  condition: [
    "new_with_tags",
    "new_without_tags",
    "very_good",
    "good",
    "satisfactory",
  ],
} as const;

export function validateProposals(
  raw: unknown,
  context: { selectedAssetIds: string[] },
): Proposal[] {
  const parsed = extractionSchema.parse(raw);
  const selected = new Set(context.selectedAssetIds);
  for (const proposal of parsed.proposals) {
    if (proposal.evidenceAssetIds.some((id) => !selected.has(id)))
      throw new Error("Foreign evidence asset");
    if (
      (proposal.reason === "unreadable" ||
        proposal.reason === "not_observed") &&
      (proposal.valueText !== null || proposal.valueNumber !== null)
    )
      throw new Error("Unobserved value must be null");
    if (
      proposal.field === "category" &&
      proposal.valueText !== null &&
      !ontology.category.includes(
        proposal.valueText as (typeof ontology.category)[number],
      )
    )
      throw new Error("Invalid category");
    if (
      proposal.field === "condition" &&
      proposal.valueText !== null &&
      !ontology.condition.includes(
        proposal.valueText as (typeof ontology.condition)[number],
      )
    )
      throw new Error("Invalid condition");
    if (proposal.field !== "measurement" && proposal.valueNumber !== null)
      throw new Error("Numeric value only applies to measurements");
    if (
      proposal.field === "measurement" &&
      proposal.valueNumber !== null &&
      !proposal.valueUnit
    )
      throw new Error("Measurement unit required");
  }
  return parsed.proposals;
}
