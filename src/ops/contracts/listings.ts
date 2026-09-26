import { z } from "zod";
import { uuidSchema } from "./core";
import { ontology } from "./extraction";

export const listingLocaleSchema = z.enum(["nl", "fr", "de", "es", "it"]);
export const confirmedFactsSchema = z
  .object({
    brand: z.string().trim().min(1).max(120).nullable(),
    model: z.string().trim().min(1).max(120).nullable(),
    category: z.enum(ontology.category).nullable(),
    size: z.string().trim().min(1).max(80).nullable(),
    colour: z.string().trim().min(1).max(80).nullable(),
    material: z.string().trim().min(1).max(200).nullable(),
    condition: z.enum(ontology.condition).nullable(),
    measurements: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            value: z.number().positive().max(10000),
            unit: z.enum(["cm", "in"]),
          })
          .strict(),
      )
      .max(20),
    defects: z.array(z.string().trim().min(1).max(200)).max(20),
  })
  .strict();
export type ConfirmedFacts = z.infer<typeof confirmedFactsSchema>;

export const confirmFactsSchema = z
  .object({
    itemId: uuidSchema,
    factRevision: z.number().int().nonnegative(),
    values: confirmedFactsSchema,
  })
  .strict();
export const saveListingSchema = z
  .object({
    itemId: uuidSchema,
    locale: listingLocaleSchema,
    priceMinor: z.number().int().safe().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    humanDescriptionOverride: z.string().trim().min(1).max(5000).nullable(),
    expectedFactRevision: z.number().int().positive(),
    expectedListingVersion: z.number().int().nonnegative(),
  })
  .strict();
export const approveListingSchema = z
  .object({
    listingId: uuidSchema,
    revisionId: uuidSchema,
    expectedListingVersion: z.number().int().positive(),
  })
  .strict();
export const listingDetailSchema = z.object({ itemId: uuidSchema }).strict();
export const saveTemplateSchema = z
  .object({
    locale: listingLocaleSchema,
    prefix: z.string().max(1000),
    suffix: z.string().max(1000),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
