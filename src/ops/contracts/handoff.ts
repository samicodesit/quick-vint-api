import { z } from "zod";
import { uuidSchema } from "./core";

export const handoffPacketSchema = z
  .object({
    itemId: uuidSchema,
    listingId: uuidSchema,
    revisionId: uuidSchema,
  })
  .strict();

export const handoffAckSchema = handoffPacketSchema
  .extend({
    requestId: uuidSchema,
    state: z.enum(["prepared", "filled"]),
    channel: z.enum(["manual", "extension"]),
  })
  .strict();

export const opsHelloSchema = z
  .object({
    type: z.literal("OPS_HELLO"),
    version: z.literal(1),
    requestId: uuidSchema,
  })
  .strict();
export const opsPrepareSchema = z
  .object({
    type: z.literal("OPS_PREPARE_LISTING"),
    version: z.literal(1),
    requestId: uuidSchema,
    workspaceId: uuidSchema,
    itemId: uuidSchema,
    listingId: uuidSchema,
    revisionId: uuidSchema,
  })
  .strict();
