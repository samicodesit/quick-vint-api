import { z } from "zod";
import { uuidSchema } from "./core";

export const inventorySearchSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    custody: z
      .enum([
        "on_hand",
        "outbound",
        "return_quarantine",
        "missing",
        "written_off",
      ])
      .optional(),
    preparation: z
      .enum(["draft", "needs_prep", "needs_photos", "needs_review", "ready"])
      .optional(),
    locationId: uuidSchema.optional(),
    cursor: z
      .object({
        createdAt: z.string().datetime({ offset: true }),
        id: uuidSchema,
      })
      .strict()
      .nullable()
      .optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export const resolveIdentifierSchema = z
  .object({ code: z.string().trim().min(1).max(160) })
  .strict();
export const createLocationSchema = z
  .object({
    parentId: uuidSchema.optional(),
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
  })
  .strict();
export const locationParentSchema = z
  .object({ locationId: uuidSchema, parentId: uuidSchema.nullable() })
  .strict();
export const locationDeleteSchema = z
  .object({ locationId: uuidSchema })
  .strict();
export const moveItemSchema = z
  .object({ itemId: uuidSchema, locationId: uuidSchema })
  .strict();
