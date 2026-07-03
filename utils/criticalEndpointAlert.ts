import { getSentry } from "./sentry";

export type CriticalEndpointFailure = {
  endpoint: string;
  status: number;
  userId?: string | null;
  details?: Record<string, unknown>;
};

function normalizeDetails(details?: Record<string, unknown>) {
  if (!details) return {};

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      typeof value === "string" && value.length > 500
        ? `${value.slice(0, 500)}...`
        : value,
    ]),
  );
}

export function reportCriticalEndpointFailure(
  failure: CriticalEndpointFailure,
) {
  const details = normalizeDetails(failure.details);

  console.error("CRITICAL_ENDPOINT_FAILURE", {
    timestamp: new Date().toISOString(),
    endpoint: failure.endpoint,
    status: failure.status,
    userId: failure.userId || null,
    details,
  });

  const sentry = getSentry();
  if (!sentry) return;

  sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("critical_endpoint", "true");
    scope.setTag("endpoint", failure.endpoint);
    scope.setTag("status", String(failure.status));
    if (failure.userId) {
      scope.setUser({ id: failure.userId });
    }
    scope.setContext("critical_endpoint_failure", {
      endpoint: failure.endpoint,
      status: failure.status,
      details,
    });
    sentry.captureException(
      new Error(`Critical endpoint failure: ${failure.endpoint}`),
    );
  });
}
