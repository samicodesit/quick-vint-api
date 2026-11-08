import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

export const FREE_TRIAL_IP_LIMIT = 5;

const EXEMPT_EMAILS = new Set([
  "samicodesit@gmail.com",
  "nadenickovao7@gmail.com",
]);

export const freeTrialIpQuotaEnabled = () =>
  process.env.FREE_TRIAL_IP_QUOTA_ENABLED === "true";

export function isFreeTrialIpExempt(email?: string | null) {
  return EXEMPT_EMAILS.has(email?.trim().toLowerCase() ?? "");
}

export function getTrustedTrialIp(headers: IncomingHttpHeaders) {
  const header =
    headers["x-vercel-forwarded-for"] ?? headers["x-forwarded-for"];
  if (typeof header !== "string") return undefined;

  const address = header.trim();
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6 || address.includes("%")) return undefined;

  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = canonical.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
  if (!mapped) return canonical;

  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function getFreeTrialIpKey(ip?: string, email?: string | null) {
  if (!freeTrialIpQuotaEnabled() || isFreeTrialIpExempt(email))
    return undefined;
  const secret = process.env.FREE_TRIAL_IP_HASH_KEY;
  if (!ip || !secret || secret.length < 32) return "unavailable";
  return createHmac("sha256", secret)
    .update("autolister:free-trial:" + ip)
    .digest("hex");
}

export function withFreeTrialIpKey<
  Query extends { setHeader(name: string, value: string): unknown },
>(query: Query, key?: string): Query {
  if (key) query.setHeader("x-autolister-free-trial-ip", key);
  return query;
}
