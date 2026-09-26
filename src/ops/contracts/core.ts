import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const roleSchema = z.enum(["owner", "manager", "lister", "warehouse"]);
export const moneySchema = z.object({
  minor: z.number().int().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const actorSchema = z.object({
  userId: uuidSchema,
  workspaceId: uuidSchema,
  role: roleSchema,
});
export const commandMetaSchema = z.object({
  idempotencyKey: uuidSchema,
  expectedVersion: z.number().int().nonnegative().nullable(),
});
export const gatewayRequestSchema = z.object({
  kind: z.enum(["query", "command"]),
  name: z.string().min(1).max(80),
  workspaceId: uuidSchema,
  payload: z.unknown(),
  meta: commandMetaSchema.optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type Actor = z.infer<typeof actorSchema>;
export type CommandMeta = z.infer<typeof commandMetaSchema>;
export type GatewayRequest = z.infer<typeof gatewayRequestSchema>;
export type Money = z.infer<typeof moneySchema>;
export type OpsErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED"
  | "BUDGET_EXCEEDED"
  | "EXTERNAL_UNCERTAIN"
  | "RETRYABLE";
export type OpsResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code: OpsErrorCode;
        message: string;
        fieldErrors?: Record<string, string>;
        retryAfterMs?: number;
      };
      requestId: string;
    };
