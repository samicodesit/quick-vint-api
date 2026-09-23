import { fetchMobileJson } from "./api.js";
import { loadUsage, type MobileUsage } from "./generationClient.js";
import { getMobileUtmParameters } from "./analytics.js";

export const MOBILE_BILLING_CLIENT = "mobile_web" as const;

export type MobileBillingTier = "starter" | "pro" | "business";

export type ListingField = "title" | "description";

export interface MobileBillingSession {
  url: string;
  mode?: "checkout" | "portal";
  reason?: string;
}

const BILLING_TIERS = new Set<MobileBillingTier>([
  "starter",
  "pro",
  "business",
]);

function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

/** Copy the exact editable value, including every description line break. */
export async function copyListingField(
  field: ListingField,
  text: string,
): Promise<boolean> {
  if (
    (field !== "title" && field !== "description") ||
    typeof text !== "string"
  )
    return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older user-gesture-compatible copy path.
  }
  return copyWithExecCommand(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBillingSession(value: unknown): MobileBillingSession {
  if (!isRecord(value) || typeof value.url !== "string") {
    throw new Error("billing_invalid_response");
  }

  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new Error("billing_invalid_response");
  }
  if (url.protocol !== "https:" || !/(^|\.)stripe\.com$/i.test(url.hostname)) {
    throw new Error("billing_invalid_response");
  }

  return {
    url: url.toString(),
    ...(value.mode === "checkout" || value.mode === "portal"
      ? { mode: value.mode }
      : {}),
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
  };
}

function assertBillingTier(tier: string): asserts tier is MobileBillingTier {
  if (!BILLING_TIERS.has(tier as MobileBillingTier)) {
    throw new Error("invalid_billing_tier");
  }
}

/**
 * Ask the bearer-owned API to create checkout. The browser never sends an
 * email, profile ID, Stripe ID, or return URL. The API derives ownership and
 * the approved return URL from the bearer token and request origin.
 */
export async function startMobileCheckout(
  tier: MobileBillingTier,
): Promise<MobileBillingSession> {
  assertBillingTier(tier);
  const response = await fetchMobileJson<unknown>(
    "/api/stripe/create-checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autolister-Client": MOBILE_BILLING_CLIENT,
      },
      body: JSON.stringify({
        tier,
        source: MOBILE_BILLING_CLIENT,
        utm: getMobileUtmParameters(),
      }),
    },
    { retryOn401: true },
  );
  return parseBillingSession(response);
}

/** Open the existing Stripe customer portal for the current bearer user. */
export async function openMobilePortal(): Promise<MobileBillingSession> {
  const response = await fetchMobileJson<unknown>(
    "/api/stripe/create-portal",
    {
      method: "POST",
      headers: { "X-Autolister-Client": MOBILE_BILLING_CLIENT },
    },
    { retryOn401: true },
  );
  return parseBillingSession(response);
}

export interface RefreshAfterCheckoutOptions {
  attempts?: number;
  delaysMs?: readonly number[];
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Stripe redirects can arrive before the webhook updates the usage
 * projection. Retry a small, bounded number of times, then surface the last
 * read error to the caller.
 */
export async function refreshAfterCheckout(
  options: RefreshAfterCheckoutOptions = {},
): Promise<MobileUsage> {
  const requestedAttempts = Number(options.attempts ?? 4);
  const attempts = Number.isFinite(requestedAttempts)
    ? Math.max(1, Math.min(4, Math.floor(requestedAttempts)))
    : 4;
  const delays = options.delaysMs ?? [250, 750, 1500];
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await loadUsage();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      const delay = Math.max(
        0,
        delays[attempt] ?? delays[delays.length - 1] ?? 0,
      );
      if (delay) await wait(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("usage_refresh_failed");
}

export function isMobileBillingTier(value: string): value is MobileBillingTier {
  return BILLING_TIERS.has(value as MobileBillingTier);
}
