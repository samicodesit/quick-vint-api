import { createHmac, timingSafeEqual } from "node:crypto";

export type VintedKeys = { accessKey: string; signingKey: string };

export function splitVintedToken(token: string): VintedKeys {
  const comma = token.indexOf(",");
  if (comma < 1 || comma === token.length - 1)
    throw new Error("Invalid Vinted Pro token");
  return {
    accessKey: token.slice(0, comma),
    signingKey: token.slice(comma + 1),
  };
}

export function signVintedRequest(
  keys: VintedKeys,
  method: string,
  pathWithQuery: string,
  body: string,
  unixSeconds: number,
): string {
  if (!pathWithQuery.startsWith("/api/v1/"))
    throw new Error("Invalid Vinted API path");
  const timestamp = String(unixSeconds);
  const payload = `${timestamp}.${method.toUpperCase()}.${pathWithQuery}.${keys.accessKey}.${body}`;
  const hash = createHmac("sha256", keys.signingKey)
    .update(payload)
    .digest("hex");
  return `t=${timestamp},v1=${hash}`;
}

export function verifyVintedWebhook(
  signingKey: string,
  rawBody: Uint8Array,
  signature: string | null,
  nowSeconds: number,
  toleranceSeconds = 300,
): { valid: boolean; timestamp: number | null } {
  const match = /^t=(\d{10}),v1=([0-9a-f]{64})$/.exec(signature ?? "");
  if (!match) return { valid: false, timestamp: null };
  const timestamp = Number(match[1]);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return { valid: false, timestamp };
  const expected = createHmac("sha256", signingKey)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(match[2], "hex");
  return {
    valid:
      actual.length === expected.length && timingSafeEqual(actual, expected),
    timestamp,
  };
}
