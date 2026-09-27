import { z } from "zod";
export const startPackSchema = z
  .object({ orderId: z.string().uuid() })
  .strict();
export const scanPackSchema = z
  .object({
    sessionId: z.string().uuid(),
    itemCode: z.string().trim().min(1).max(160),
  })
  .strict();
export const attachLabelSchema = z
  .object({ sessionId: z.string().uuid(), labelId: z.string().uuid() })
  .strict();
export const handoverSchema = z
  .object({ shipmentId: z.string().uuid() })
  .strict();
export const packDetailSchema = z
  .object({ orderId: z.string().uuid() })
  .strict();
