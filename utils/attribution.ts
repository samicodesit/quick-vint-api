import { hasPaidEntitlementStatus } from "../src/utils/subscriptionStatus";

export const ATTRIBUTION_MAX_FIELD_LENGTH = 80;
export const ATTRIBUTION_LOOKBACK_DAYS = 180;
export const NEW_ACQUISITION_WINDOW_MS = 24 * 60 * 60 * 1000;

export const ATTRIBUTION_SOURCES = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "linkedin",
  "reddit",
  "google",
  "direct",
  "unknown",
] as const;

export const ATTRIBUTION_MEDIA = [
  "organic_social",
  "paid_social",
  "referral",
  "search",
  "email",
  "direct",
  "unknown",
] as const;

export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];
export type AttributionMedium = (typeof ATTRIBUTION_MEDIA)[number];

export type Attribution = {
  source: AttributionSource;
  medium: AttributionMedium;
  campaign: string | null;
  content: string | null;
  capturedAt: string;
  referrerHost: string | null;
};

export type AttributionClaimRow = Omit<
  Attribution,
  "content" | "referrerHost"
> & {
  userId: string;
  claimedAt: string;
  content?: string | null;
  referrerHost?: string | null;
};

export type AttributionProfile = {
  id: string;
  created_at: string;
  subscription_status?: string | null;
  subscription_tier?: string | null;
};

export type AttributionGeneration = {
  user_id: string | null;
  endpoint: string;
  response_status: number | string | null;
  created_at: string;
};

export type AttributionReport = {
  window: {
    days: number;
    start: string;
    end: string;
  };
  cohorts: Array<{
    source: AttributionSource;
    medium: AttributionMedium;
    campaign: string | null;
    captured: number;
    newSignups: number;
    activated: number;
    paid: number;
  }>;
  totals: {
    captured: number;
    newSignups: number;
    activated: number;
    paid: number;
  };
  unknownProfiles: number;
  unobservableCrossDevice: true;
};

const SOURCE_SET = new Set<string>(ATTRIBUTION_SOURCES);
const MEDIUM_SET = new Set<string>(ATTRIBUTION_MEDIA);
const SAFE_REFERRER_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "www.instagram.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "facebook.com",
  "www.facebook.com",
  "linkedin.com",
  "www.linkedin.com",
  "reddit.com",
  "www.reddit.com",
  "google.com",
  "www.google.com",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function sanitizeSlug(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ATTRIBUTION_MAX_FIELD_LENGTH);
  return normalized || null;
}

function sanitizeReferrerHost(value: unknown) {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (SAFE_REFERRER_HOSTS.has(host)) return host;
  return null;
}

export function sanitizeAttribution(
  value: unknown,
  options: { now?: string } = {},
): Attribution | null {
  if (!isRecord(value)) return null;

  const source = typeof value.source === "string" ? value.source : "";
  const medium = typeof value.medium === "string" ? value.medium : "";
  if (!SOURCE_SET.has(source) || !MEDIUM_SET.has(medium)) return null;

  const capturedAt = parseDate(value.capturedAt);
  if (!capturedAt) return null;

  const now = Date.parse(options.now || new Date().toISOString());
  const capturedTimestamp = Date.parse(capturedAt);
  if (!Number.isFinite(now) || !Number.isFinite(capturedTimestamp)) return null;
  if (
    capturedTimestamp > now + 5 * 60 * 1000 ||
    capturedTimestamp < now - ATTRIBUTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  return {
    source: source as AttributionSource,
    medium: medium as AttributionMedium,
    campaign: sanitizeSlug(value.campaign),
    content: sanitizeSlug(value.content),
    capturedAt,
    referrerHost: sanitizeReferrerHost(value.referrerHost),
  };
}

export function parseAttributionInput(value: unknown, now?: string) {
  return sanitizeAttribution(value, { now });
}

export function isNewAcquisition(input: {
  profileCreatedAt: string;
  claimedAt: string;
}) {
  const profileCreated = Date.parse(input.profileCreatedAt);
  const claimed = Date.parse(input.claimedAt);
  if (!Number.isFinite(profileCreated) || !Number.isFinite(claimed))
    return false;
  const delta = claimed - profileCreated;
  return delta >= 0 && delta <= NEW_ACQUISITION_WINDOW_MS;
}

function isSuccessfulGeneration(log: AttributionGeneration) {
  return (
    log.endpoint === "/api/generate" && Number(log.response_status) === 200
  );
}

function isPaidProfile(profile: AttributionProfile) {
  return (
    profile.subscription_tier !== "free" &&
    hasPaidEntitlementStatus(profile.subscription_status)
  );
}

export function buildAttributionReport(
  claims: AttributionClaimRow[],
  profiles: AttributionProfile[],
  generations: AttributionGeneration[],
  options: { now: string; days: number },
): AttributionReport {
  const nowTimestamp = Date.parse(options.now);
  const days = Math.min(Math.max(Math.floor(options.days || 1), 1), 365);
  const end = Number.isFinite(nowTimestamp)
    ? new Date(nowTimestamp).toISOString()
    : new Date().toISOString();
  const startTimestamp =
    (Number.isFinite(nowTimestamp) ? nowTimestamp : Date.now()) -
    (days - 1) * 24 * 60 * 60 * 1000;
  const start = new Date(startTimestamp).toISOString();
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const successfulUsers = new Set(
    generations.filter(isSuccessfulGeneration).map((log) => log.user_id),
  );
  const cohorts = new Map<string, AttributionReport["cohorts"][number]>();
  const totals = {
    captured: 0,
    newSignups: 0,
    activated: 0,
    paid: 0,
  };

  for (const claim of claims) {
    if (claim.claimedAt < start || claim.claimedAt > end) continue;
    const key = [claim.source, claim.medium, claim.campaign || ""].join("|");
    const cohort = cohorts.get(key) || {
      source: claim.source,
      medium: claim.medium,
      campaign: claim.campaign,
      captured: 0,
      newSignups: 0,
      activated: 0,
      paid: 0,
    };
    cohort.captured += 1;
    totals.captured += 1;

    const profile = profileById.get(claim.userId);
    const isNew = Boolean(
      profile &&
      isNewAcquisition({
        profileCreatedAt: profile.created_at,
        claimedAt: claim.claimedAt,
      }),
    );
    if (isNew) {
      cohort.newSignups += 1;
      totals.newSignups += 1;
      if (successfulUsers.has(claim.userId)) {
        cohort.activated += 1;
        totals.activated += 1;
      }
      if (profile && isPaidProfile(profile)) {
        cohort.paid += 1;
        totals.paid += 1;
      }
    }
    cohorts.set(key, cohort);
  }

  const attributedIds = new Set(claims.map((claim) => claim.userId));
  const unknownProfiles = profiles.filter(
    (profile) =>
      profile.created_at >= start &&
      profile.created_at <= end &&
      !attributedIds.has(profile.id),
  ).length;

  return {
    window: { days, start, end },
    cohorts: Array.from(cohorts.values()).sort((a, b) => {
      const sourceOrder = a.source.localeCompare(b.source);
      if (sourceOrder) return sourceOrder;
      return String(a.campaign || "").localeCompare(String(b.campaign || ""));
    }),
    totals,
    unknownProfiles,
    unobservableCrossDevice: true,
  };
}
