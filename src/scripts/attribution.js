export const FIRST_TOUCH_STORAGE_KEY = "autolister.first_touch.v1";

const SOURCES = new Set([
  "x",
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "linkedin",
  "reddit",
  "google",
  "direct",
  "unknown",
]);
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
    const host = new URL(referrer).hostname.toLowerCase().replace(/\.$/, "");
    return Object.prototype.hasOwnProperty.call(REFERRER_SOURCES, host)
      ? host
      : null;
  } catch {
    return null;
  }
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
  if (!SOURCES.has(source) || !MEDIA.has(medium) || !capturedAt) return null;

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
  if (existing) return existing;
  if (!storage?.setItem) return null;

  let url;
  try {
    url = new URL(href, "https://autolister.app/");
  } catch {
    return null;
  }

  const referrerHost = getReferrerHost(referrer);
  const referrerSource = referrerHost ? REFERRER_SOURCES[referrerHost] : null;
  const querySource = String(url.searchParams.get("utm_source") || "")
    .trim()
    .toLowerCase();
  const source = SOURCES.has(querySource)
    ? querySource
    : referrerSource || null;
  if (!source) return null;

  const queryMedium = String(url.searchParams.get("utm_medium") || "")
    .trim()
    .toLowerCase();
  const medium = MEDIA.has(queryMedium) ? queryMedium : inferMedium(source);
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
