import { z } from "zod";

export const inviteCreateSchema = z
  .object({
    email: z.string().email().max(320),
    role: z.enum(["owner", "manager", "lister", "warehouse"]),
  })
  .strict();
export const inviteAcceptSchema = z
  .object({ token: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
export const inviteRevokeSchema = z
  .object({ inviteId: z.string().uuid() })
  .strict();
export const memberUpdateSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(["owner", "manager", "lister", "warehouse"]),
    active: z.boolean(),
  })
  .strict();
export const settingsUpdateSchema = z
  .object({
    aiMonthlyBudgetMinor: z.number().int().nonnegative().safe(),
    aiCurrency: z.string().regex(/^[A-Z]{3}$/),
    mediaRetentionDays: z.number().int().min(30).max(3650),
  })
  .strict();
export const credentialStoreSchema = z
  .object({
    provider: z.enum(["vinted_pro", "resend"]),
    secret: z.string().min(1).max(10000),
  })
  .strict();
export const credentialDeleteSchema = z
  .object({ provider: z.enum(["vinted_pro", "resend"]) })
  .strict();
export const exportPageSchema = z
  .object({
    table: z.string().min(1).max(80),
    offset: z.number().int().nonnegative().max(100000),
  })
  .strict();
