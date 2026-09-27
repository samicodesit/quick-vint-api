import { z } from "zod";
export const receiveReturnSchema = z
  .object({
    orderId: z.string().uuid(),
    itemCodes: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
  })
  .strict();
export const inspectReturnSchema = z
  .object({
    returnLineId: z.string().uuid(),
    decision: z.enum(["resellable", "quarantine", "damaged"]),
    note: z.string().max(1000),
  })
  .strict();
export const restockReturnSchema = z
  .object({
    returnLineId: z.string().uuid(),
    locationId: z.string().uuid().nullable(),
  })
  .strict();
export const returnDetailSchema = z
  .object({ returnId: z.string().uuid() })
  .strict();
