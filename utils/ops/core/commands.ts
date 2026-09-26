import { randomUUID } from "node:crypto";
import {
  actorSchema,
  commandMetaSchema,
  type Actor,
  type CommandMeta,
  type OpsResult,
} from "../../../src/ops/contracts/core";
import { failure, OpsError } from "./errors";

// Operations must commit their mutation, audit and idempotency record in one database RPC.
export async function runCommand<T>(
  actor: Actor,
  meta: CommandMeta,
  operation: () => Promise<T>,
  requestId = randomUUID(),
): Promise<OpsResult<T>> {
  if (
    !actorSchema.safeParse(actor).success ||
    !commandMetaSchema.safeParse(meta).success
  ) {
    return failure("VALIDATION", "Invalid command context", requestId);
  }
  try {
    return { ok: true, data: await operation(), requestId };
  } catch (error) {
    if (error instanceof OpsError)
      return failure(error.code, error.message, requestId);
    if ((error as { opsCode?: string }).opsCode === "CONFLICT") {
      return failure("CONFLICT", "Idempotency key conflict", requestId);
    }
    return failure("RETRYABLE", "Command could not be completed", requestId);
  }
}
