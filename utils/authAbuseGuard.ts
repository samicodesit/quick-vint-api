import type { VercelRequest } from "@vercel/node";
import { ApiLogger } from "./apiLogger";
import { isDisposableEmail } from "./disposableDomains";
import { supabase } from "./supabaseClient";

const BLOCKED_AUTH_EMAIL_DOMAINS = new Set(["emailos.de"]);
const MAJOR_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "proton.me",
  "protonmail.com",
]);

export type AuthEmailBlockReason =
  | "blocked_email_domain"
  | "disposable_email"
  | "spam_local_part";

export type AuthRateLimitReason =
  | "email_magic_link_rate_limit"
  | "ip_magic_link_rate_limit"
  | "domain_magic_link_rate_limit";

export interface AuthRateLimitResult {
  limited: boolean;
  reason?: AuthRateLimitReason;
}

function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function getEmailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex < 0) return "";
  return normalized.slice(atIndex + 1);
}

function getEmailLocalPart(email: string) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex < 0) return "";
  return normalized.slice(0, atIndex);
}

export function getAuthEmailBlockReason(
  email: string,
): AuthEmailBlockReason | null {
  const domain = getEmailDomain(email);
  if (BLOCKED_AUTH_EMAIL_DOMAINS.has(domain)) return "blocked_email_domain";
  if (isDisposableEmail(email)) return "disposable_email";

  const localPart = getEmailLocalPart(email);
  if (/^spam(?:[._+-]?\d+)?$/i.test(localPart)) return "spam_local_part";

  return null;
}

async function countRecentAuthAttempts(filters: {
  sinceIso: string;
  email?: string;
  ipAddress?: string;
  emailDomain?: string;
}) {
  let query = supabase
    .from("api_logs")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", "/api/auth/magic-link")
    .gte("created_at", filters.sinceIso);

  if (filters.email) {
    query = query.eq("user_email", filters.email);
  }

  if (filters.ipAddress) {
    query = query.eq("ip_address", filters.ipAddress);
  }

  if (filters.emailDomain) {
    query = query.eq("full_request_body->>emailDomain", filters.emailDomain);
  }

  const { count, error } = await query;
  if (error) {
    console.error("Failed to check auth abuse rate limit:", error);
    return 0;
  }

  return count || 0;
}

export async function checkMagicLinkRateLimit({
  req,
  email,
}: {
  req: VercelRequest;
  email: string;
}): Promise<AuthRateLimitResult> {
  const metadata = ApiLogger.extractRequestMetadata(req);
  const normalizedEmail = normalizeEmail(email);
  const emailDomain = getEmailDomain(normalizedEmail);
  const now = Date.now();
  const last15m = new Date(now - 15 * 60 * 1000).toISOString();
  const last10m = new Date(now - 10 * 60 * 1000).toISOString();

  const emailAttempts = await countRecentAuthAttempts({
    sinceIso: last15m,
    email: normalizedEmail,
  });
  if (emailAttempts >= 4) {
    return { limited: true, reason: "email_magic_link_rate_limit" };
  }

  if (metadata.ipAddress) {
    const ipAttempts = await countRecentAuthAttempts({
      sinceIso: last10m,
      ipAddress: metadata.ipAddress,
    });
    if (ipAttempts >= 8) {
      return { limited: true, reason: "ip_magic_link_rate_limit" };
    }
  }

  if (emailDomain && !MAJOR_EMAIL_DOMAINS.has(emailDomain)) {
    const domainAttempts = await countRecentAuthAttempts({
      sinceIso: last15m,
      emailDomain,
    });
    if (domainAttempts >= 6) {
      return { limited: true, reason: "domain_magic_link_rate_limit" };
    }
  }

  return { limited: false };
}
