type HeaderMap = Record<string, string | string[] | number | null | undefined>;

export type HeaderLike =
  | { get(name: string): string | null }
  | HeaderMap
  | null
  | undefined;

function readHeader(headers: HeaderLike, name: string) {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get(name: string): string | null }).get(name);
  }

  const value =
    (headers as HeaderMap)[name] ||
    (headers as HeaderMap)[name.toLowerCase()] ||
    (headers as HeaderMap)[name.toUpperCase()];
  if (Array.isArray(value)) return value[0] || null;
  return value == null ? null : String(value);
}

export function extractOpenAIRateLimitHeaders(headers: HeaderLike) {
  if (!headers) return null;

  return {
    limitRequests: readHeader(headers, "x-ratelimit-limit-requests"),
    limitTokens: readHeader(headers, "x-ratelimit-limit-tokens"),
    remainingRequests: readHeader(headers, "x-ratelimit-remaining-requests"),
    remainingTokens: readHeader(headers, "x-ratelimit-remaining-tokens"),
    resetRequests: readHeader(headers, "x-ratelimit-reset-requests"),
    resetTokens: readHeader(headers, "x-ratelimit-reset-tokens"),
  };
}
