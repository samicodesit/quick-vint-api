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
  console.error("CRITICAL_ENDPOINT_FAILURE", {
    timestamp: new Date().toISOString(),
    endpoint: failure.endpoint,
    status: failure.status,
    userId: failure.userId || null,
    details: normalizeDetails(failure.details),
  });
}
