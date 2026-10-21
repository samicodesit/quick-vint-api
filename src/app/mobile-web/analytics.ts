import { fetchMobileJson } from "./api.js";
import type { MobileWebSession } from "./types.js";
import { getWebAnalyticsContext } from "../../scripts/webAnalyticsContext";
import {
  captureFirstTouch,
  getStoredAttribution,
  FIRST_TOUCH_STORAGE_KEY,
} from "../../scripts/attribution.js";

export const MOBILE_REF_STORAGE_KEY = "autolister.mobile_web.ref.v1";

export const MOBILE_ANALYTICS_EVENTS = [
  "web_app_view",
  "web_style_setup",
  "auth_complete",
  "session_restored",
  "upload_complete",
  "generation_success",
  "generation_error",
  "web_generation_run",
  "web_paywall_view",
  "copy",
  "vinted_click",
  "checkout_start",
  "checkout_return",
  "chrome_store_click",
] as const;

export type MobileAnalyticsEvent = (typeof MOBILE_ANALYTICS_EVENTS)[number];

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const ALLOWED_CONTEXT_KEYS = new Set([
  "target",
  "method",
  "imageCount",
  "resultStatus",
  "field",
  "phase",
  "tier",
  "packId",
  "countryCode",
  "language",
  "titleLanguageCode",
  "descriptionLanguageCode",
  "descriptionLength",
  "useBulletPoints",
  "useHashtags",
  "useEmojis",
  "includeSellerNote",
  "reason",
  "entryPoint",
  "count",
  "status",
  "errorCode",
  "retryable",
]);

const CHECKOUT_RETURN_STATUSES = new Set(["success", "cancel", "manage"]);

function getStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function stringValue(value: unknown, maxLength = 80): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return (
    normalized
      .replace(/[^a-z0-9._:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength) || null
  );
}

function numericValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(500, Math.floor(value)));
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeStorage(): StorageLike | null {
  return getStorage();
}

function readRef(storage = safeStorage()): string | null {
  if (!storage) return null;
  try {
    return stringValue(storage.getItem(MOBILE_REF_STORAGE_KEY));
  } catch {
    return null;
  }
}

function captureRefFromUrl(
  href: string | undefined,
  storage = safeStorage(),
): string | null {
  if (!storage) return null;
  try {
    const url = new URL(
      href || globalThis.location?.href || "",
      "https://autolister.app/",
    );
    const ref = stringValue(url.searchParams.get("ref"));
    if (ref) storage.setItem(MOBILE_REF_STORAGE_KEY, ref);
    return ref || readRef(storage);
  } catch {
    return readRef(storage);
  }
}

/** Capture the existing first-touch record and the separately approved ref key. */
export function captureMobileFirstTouch(
  options: {
    href?: string;
    referrer?: string;
    storage?: StorageLike | null;
    now?: string;
  } = {},
) {
  const storage = options.storage ?? safeStorage();
  const attribution = captureFirstTouch({
    href: options.href,
    referrer: options.referrer,
    storage,
    now: options.now,
  });
  const ref = captureRefFromUrl(options.href, storage);
  return { attribution, ref };
}

export function getMobileUtmParameters(): Record<string, string> {
  const storage = safeStorage();
  const attribution = getStoredAttribution(storage);
  const result: Record<string, string> = {};
  if (attribution) {
    const source = stringValue(attribution.source);
    const medium = stringValue(attribution.medium);
    const campaign = stringValue(attribution.campaign);
    const content = stringValue(attribution.content);
    if (source) result.utm_source = source;
    if (medium) result.utm_medium = medium;
    if (campaign) result.utm_campaign = campaign;
    if (content) result.utm_content = content;
  }

  const ref = readRef(storage) || captureRefFromUrl(undefined, storage);
  if (ref) result.ref = ref;
  return result;
}

function sanitizeContext(
  value: unknown,
  event: MobileAnalyticsEvent,
): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const context: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(source)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) continue;
    if (key === "status" && event === "checkout_return") {
      const status = stringValue(item);
      if (status && CHECKOUT_RETURN_STATUSES.has(status)) context[key] = status;
      continue;
    }
    if (key === "imageCount" || key === "status" || key === "count") {
      const numeric = numericValue(item);
      if (numeric !== null) context[key] = numeric;
      continue;
    }
    if (
      [
        "retryable",
        "useBulletPoints",
        "useHashtags",
        "useEmojis",
        "includeSellerNote",
      ].includes(key)
    ) {
      const boolean = booleanValue(item);
      if (boolean !== null) context[key] = boolean;
      continue;
    }
    const string = stringValue(item);
    if (string) context[key] = string;
  }
  return context;
}

function isMobileAnalyticsEvent(value: string): value is MobileAnalyticsEvent {
  return (MOBILE_ANALYTICS_EVENTS as readonly string[]).includes(value);
}

/**
 * Enqueue a small, bounded event in the existing durable website transport.
 * Unknown event names and context keys are ignored rather than sent.
 */
export async function trackMobileEvent(
  event: MobileAnalyticsEvent | string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  if (!isMobileAnalyticsEvent(event)) return false;
  try {
    const runtime = (globalThis as any).AutoListerWebsiteTelemetry;
    if (!runtime) return false;
    const result = await runtime.track(event, {
      source: "mobile_web",
      page: "/app",
      context: {
        ...sanitizeContext(context, event),
        ...getWebAnalyticsContext(),
        source: readRef() || "app_direct",
      },
      utm: getMobileUtmParameters(),
    });
    return result.queued === true;
  } catch {
    return false;
  }
}

const RESTORED_SESSION_KEY = "autolister.session-restored.v1";
let lastRestoredSession = "";
const restoring = new Map<string, Promise<boolean>>();

function restorationKey(userId: string): string {
  return `${userId}:${getWebAnalyticsContext().webSessionId || "page"}`;
}

function rememberRestoration(key: string): void {
  lastRestoredSession = key;
  try {
    window.sessionStorage.setItem(RESTORED_SESSION_KEY, key);
  } catch {
    // Memory still coalesces repeated checks when storage is unavailable.
  }
}

/** One background confirmation per account and visit, including across reloads. */
export async function trackMobileSessionRestored(
  userId: string,
): Promise<boolean> {
  const key = restorationKey(userId);
  if (lastRestoredSession === key) return true;
  try {
    if (window.sessionStorage.getItem(RESTORED_SESSION_KEY) === key)
      return true;
  } catch {
    // Analytics must never block access to the app.
  }
  const pending = restoring.get(key);
  if (pending) return pending;
  const queued = trackMobileEvent("session_restored", { method: "session" })
    .then((success) => {
      if (success) rememberRestoration(key);
      return success;
    })
    .finally(() => restoring.delete(key));
  restoring.set(key, queued);
  return queued;
}

/** Reserve auth_complete for successful credential verification. */
export async function trackMobileAuthComplete(
  userId: string,
  method: "email" | "google",
): Promise<boolean> {
  const key = restorationKey(userId);
  const queued = await trackMobileEvent("auth_complete", { method });
  if (queued) rememberRestoration(key);
  return queued;
}

/** Claim the stored first-touch record after Supabase authentication. */
export async function claimFirstTouchAfterAuth(
  session: Pick<MobileWebSession, "access_token"> | null | undefined,
): Promise<boolean> {
  if (!session?.access_token) return false;
  const attribution = getStoredAttribution(safeStorage());
  if (!attribution) return false;

  try {
    await fetchMobileJson(
      "/api/attribution/claim",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ attribution }),
      },
      { retryOn401: true },
    );
    return true;
  } catch {
    return false;
  }
}

export { FIRST_TOUCH_STORAGE_KEY };
