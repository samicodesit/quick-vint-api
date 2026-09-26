import type { OpsErrorCode, OpsResult } from "../../../src/ops/contracts/core";

export class OpsError extends Error {
  constructor(
    public readonly code: OpsErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function failure(
  code: OpsErrorCode,
  message: string,
  requestId: string,
): OpsResult<never> {
  return { ok: false, error: { code, message }, requestId };
}

export function statusFor(code: OpsErrorCode) {
  return (
    {
      VALIDATION: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      UNSUPPORTED: 422,
      BUDGET_EXCEEDED: 429,
      EXTERNAL_UNCERTAIN: 503,
      RETRYABLE: 503,
    } as const
  )[code];
}
