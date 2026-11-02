const BLOCK_CODES = new Set([
  "free_lifetime_limit",
  "daily_limit",
  "monthly_limit",
  "account_paused",
  "payment_required",
]);

/** Recovery belongs to this attempt only. Preserve the original error in event context. */
export function generationOutcome(
  errorCode: string | undefined,
  operationId: string,
  recovered: {
    operation_id?: string | null;
    operation_state?: string | null;
  } | null,
):
  | "generation_recovered"
  | "generation_blocked"
  | "generation_recovery_pending"
  | "generation_error" {
  if (
    recovered?.operation_id === operationId &&
    recovered.operation_state === "succeeded"
  )
    return "generation_recovered";
  if (errorCode && BLOCK_CODES.has(errorCode)) return "generation_blocked";
  if (
    !recovered ||
    recovered.operation_id !== operationId ||
    ["running", "pending"].includes(recovered.operation_state || "")
  )
    return "generation_recovery_pending";
  return "generation_error";
}
