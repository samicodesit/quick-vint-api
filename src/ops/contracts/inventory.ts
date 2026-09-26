import { z } from "zod";
import { uuidSchema } from "./core";

export const createItemSchema = z
  .object({
    existingSku: z.string().trim().min(1).max(80).optional(),
    sourceId: uuidSchema.optional(),
    lotId: uuidSchema.optional(),
  })
  .strict();
export const addIdentifierSchema = z
  .object({
    itemId: uuidSchema,
    kind: z.enum(["seller_sku", "barcode_alias", "ean"]),
    value: z.string().trim().min(1).max(160),
  })
  .strict();
export const createLotSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    totalCostMinor: z.number().int().nonnegative().safe().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    supplierId: uuidSchema.optional(),
  })
  .strict()
  .refine((lot) => (lot.totalCostMinor === null) === (lot.currency === null));
export const allocateLotSchema = z
  .object({
    lotId: uuidSchema,
    overrides: z.record(uuidSchema, z.number().int().nonnegative().safe()),
  })
  .strict();
export const correctItemCostSchema = z
  .object({
    itemId: uuidSchema,
    costMinor: z.number().int().nonnegative().safe().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((value) => (value.costMinor === null) === (value.currency === null));
export const inventoryListSchema = z
  .object({ limit: z.number().int().min(1).max(100).default(50) })
  .strict();
export const itemDetailSchema = z.object({ itemId: uuidSchema }).strict();
export const lotDetailSchema = z.object({ lotId: uuidSchema }).strict();
