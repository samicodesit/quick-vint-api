const PRODUCTION_APP_ORIGINS = [
  "https://autolister.app",
  "https://www.autolister.app",
] as const;

// Keep this predicate separate from the app allowlist. Vinted page origins are
// needed by extension requests, but must not become app redirect origins.
const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|(?:co|com)\.[a-z]{2})$/;

function getConfiguredAppOrigins(env: typeof process.env = process.env) {
  return (env.VERCEL_APP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedAppOrigin(origin?: string): boolean {
  // Requests without an Origin header are same-origin or non-browser requests.
  if (origin === undefined) return true;

  return [...PRODUCTION_APP_ORIGINS, ...getConfiguredAppOrigins()].includes(
    origin,
  );
}

export function isAllowedVintedOrigin(origin?: string): boolean {
  return typeof origin === "string" && vintedOriginPattern.test(origin);
}
