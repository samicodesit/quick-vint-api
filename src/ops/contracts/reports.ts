import { z } from "zod";

export const financialObservationSchema = z
  .object({
    orderId: z.string().uuid(),
    kind: z.enum([
      "seller_fee",
      "shipping",
      "packaging",
      "refund",
      "adjustment_credit",
      "adjustment_debit",
    ]),
    amountMinor: z.number().int().nonnegative().safe(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    source: z.string().trim().min(1).max(80),
    sourceKey: z.string().trim().min(1).max(160),
    observedAt: z.string().datetime(),
  })
  .strict();
export const reportQuerySchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
  })
  .strict()
  .refine(
    (value) =>
      value.from <= value.to &&
      Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000,
    "Report range must be at most one year",
  );
