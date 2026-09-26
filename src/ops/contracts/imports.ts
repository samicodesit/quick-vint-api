import { z } from "zod";

export const importFieldSchema = z.enum([
  "sku",
  "externalId",
  "title",
  "location",
  "cost",
  "currency",
  "saleState",
  "source",
  "imageUrl",
]);
export const importMappingSchema = z
  .object({
    columns: z
      .record(importFieldSchema, z.string().min(1).max(160).nullable())
      .default({}),
    accountScope: z.string().trim().min(1).max(120).default("manual"),
  })
  .strict();
export const previewImportSchema = z
  .object({ fileId: z.string().uuid(), mapping: importMappingSchema })
  .strict();
export const applyImportSchema = z
  .object({ importId: z.string().uuid() })
  .strict();
export const exportImportSchema = z
  .object({ importId: z.string().uuid() })
  .strict();
