export const FIRST_TOUCH_STORAGE_KEY = "autolister.first_touch.v1";

const MEDIA = new Set([
  "organic_social",
  "paid_social",
  "referral",
  "search",
  "email",
  "direct",
  "unknown",
]);
const REFERRER_SOURCES = {
  "x.com": "x",
  "www.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "t.co": "x",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "youtu.be": "youtube",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "linkedin.com": "linkedin",
  "www.linkedin.com": "linkedin",
  "reddit.com": "reddit",
  "www.reddit.com": "reddit",
  "google.com": "google",
  "www.google.com": "google",
};

function getDefaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalizeSlug(value) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || null;
}

function getReferrerHost(referrer) {
  if (typeof referrer !== "string" || !referrer.trim()) return null;
  try {
    const url = new URL(referrer);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return isPublicReferrerHost(host) ? host : null;
  } catch {
    return null;
  }
}

function isPublicReferrerHost(host) {
  return (
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    ) && !/(^|\.)(autolister\.app|localhost|local|internal)$/.test(host)
  );
}

function isAttributionSource(source) {
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(source);
}

function inferMedium(source) {
  if (source === "google") return "search";
  if (
    [
      "x",
      "tiktok",
      "instagram",
      "youtube",
      "facebook",
      "linkedin",
      "reddit",
    ].includes(source)
  ) {
    return "organic_social";
  }
  if (source === "direct") return "direct";
  return "unknown";
}

function normalizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = typeof value.source === "string" ? value.source : "";
  const medium = typeof value.medium === "string" ? value.medium : "";
  const capturedAt =
    typeof value.capturedAt === "string" &&
    Number.isFinite(Date.parse(value.capturedAt))
      ? new Date(value.capturedAt).toISOString()
      : null;
  if (!isAttributionSource(source) || !MEDIA.has(medium) || !capturedAt)
    return null;

  const referrerHost = getReferrerHost(
    typeof value.referrerHost === "string"
      ? `https://${value.referrerHost}/`
      : "",
  );
  return {
    source,
    medium,
    campaign: normalizeSlug(value.campaign),
    content: normalizeSlug(value.content),
    capturedAt,
    referrerHost,
  };
}

export function readStoredAttribution(storage = getDefaultStorage()) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAttribution(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function getStoredAttribution(storage = getDefaultStorage()) {
  return readStoredAttribution(storage);
}

export function captureFirstTouch({
  href = globalThis.location?.href || "",
  referrer = globalThis.document?.referrer || "",
  storage = getDefaultStorage(),
  now = new Date().toISOString(),
} = {}) {
  const existing = readStoredAttribution(storage);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  if (existing) {
    const age = nowMs - Date.parse(existing.capturedAt);
    // Match the authenticated claim API's 180-day window and clock tolerance.
    // A stale browser record must not prevent fresh acquisition forever.
    if (age >= -5 * 60 * 1000 && age <= 180 * 24 * 60 * 60 * 1000)
      return existing;
  }
  if (!storage?.setItem) return null;

  let url;
  try {
    url = new URL(href, "https://autolister.app/");
  } catch {
    return null;
  }

  const candidateHost = getReferrerHost(referrer);
  const referrerHost = candidateHost === url.hostname ? null : candidateHost;
  const referrerSource =
    referrerHost &&
    Object.prototype.hasOwnProperty.call(REFERRER_SOURCES, referrerHost)
      ? REFERRER_SOURCES[referrerHost]
      : null;
  const querySource = String(url.searchParams.get("utm_source") || "")
    .trim()
    .toLowerCase();
  const source = isAttributionSource(querySource)
    ? querySource
    : referrerSource || (referrerHost ? "unknown" : null);
  if (!source) return null;

  const queryMedium = String(url.searchParams.get("utm_medium") || "")
    .trim()
    .toLowerCase();
  const medium = MEDIA.has(queryMedium)
    ? queryMedium
    : source === "unknown" && referrerHost
      ? "referral"
      : inferMedium(source);
  const attribution = normalizeAttribution({
    source,
    medium,
    campaign: url.searchParams.get("utm_campaign"),
    content: url.searchParams.get("utm_content"),
    capturedAt: now,
    referrerHost,
  });
  if (!attribution) return null;

  try {
    storage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return null;
  }
}
