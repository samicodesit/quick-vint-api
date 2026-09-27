import { z } from "zod";

export const manualOrderSchema = z
  .object({
    paidConfirmed: z.boolean(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    sellerTotalMinor: z.number().int().nonnegative().nullable(),
    lines: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            title: z.string().trim().min(1).max(200),
            sellerRevenueMinor: z
              .number()
              .int()
              .nonnegative()
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) => (value.currency === null) === (value.sellerTotalMinor === null),
    "Currency and total must both be known or unknown",
  );

export const reserveOrderSchema = z
  .object({ orderId: z.string().uuid() })
  .strict();
export const orderDetailSchema = reserveOrderSchema;
export const orderListSchema = z
  .object({
    status: z
      .enum([
        "unpaid",
        "confirmed",
        "reserved",
        "picking",
        "packed",
        "dispatched",
        "cancelled",
        "unknown",
      ])
      .optional(),
  })
  .strict();
