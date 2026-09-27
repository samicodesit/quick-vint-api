import { z } from "zod";
export const createPickWaveSchema = z
  .object({
    orders: z
      .array(
        z
          .object({
            orderId: z.string().uuid(),
            toteCode: z.string().trim().min(1).max(80).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const claimPickTaskSchema = z
  .object({ taskId: z.string().uuid() })
  .strict();
export const verifyPickSchema = z
  .object({
    taskId: z.string().uuid(),
    claimId: z.string().uuid(),
    itemCode: z.string().trim().min(1).max(160),
    toteCode: z.string().trim().max(80).nullable(),
  })
  .strict();
export const missingPickSchema = z
  .object({
    taskId: z.string().uuid(),
    claimId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const pickWaveDetailSchema = z
  .object({ waveId: z.string().uuid() })
  .strict();
