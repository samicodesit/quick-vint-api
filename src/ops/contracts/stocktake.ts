import { z } from "zod";

export const startStocktakeSchema = z
  .object({ locationId: z.string().uuid() })
  .strict();
export const stocktakeIdSchema = z
  .object({ stocktakeId: z.string().uuid() })
  .strict();
export const observeStocktakeSchema = stocktakeIdSchema.extend({
  itemCode: z.string().trim().min(1).max(160),
});
export const resolveStocktakeSchema = stocktakeIdSchema.extend({
  itemId: z.string().uuid(),
  decision: z.enum(["accept_missing", "accept_unexpected", "write_off"]),
  note: z.string().trim().min(1).max(1000),
});
