import {
  continueIncidentWork,
  recordServerIncident,
} from "./incidents/service";
import { sanitizeContext } from "./incidents/contract";

export type CriticalEndpointFailure = {
  endpoint: string;
  status: number;
  userId?: string | null;
  error?: unknown;
  details?: Record<string, unknown>;
};

export function reportCriticalEndpointFailure(
  failure: CriticalEndpointFailure,
) {
  try {
    const details = sanitizeContext(failure.details, true);
    console.error("CRITICAL_ENDPOINT_FAILURE", {
      timestamp: new Date().toISOString(),
      endpoint: failure.endpoint,
      status: failure.status,
      userId: failure.userId || null,
      details,
    });
    const event =
      failure.endpoint === "/api/stripe/webhook"
        ? "webhook_failed"
        : failure.endpoint.includes("checkout")
          ? "checkout_failed"
          : failure.endpoint.includes("auth")
            ? "auth_failed"
            : failure.endpoint === "/api/phone-upload"
              ? "phone_upload_transfer_error"
              : "own_context_exception";
    continueIncidentWork(
      recordServerIncident({
        event,
        error: failure.error,
        userId: failure.userId || undefined,
        context: {
          ...details,
          errorCode: `${event}:${failure.status}`,
          stage: details.stage || failure.endpoint,
          statusCode: failure.status,
        },
      }),
    );
  } catch {
    /* Reporting must not change the product response. */
  }
}
