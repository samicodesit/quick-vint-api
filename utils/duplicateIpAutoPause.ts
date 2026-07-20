import { hasPaidEntitlementStatus } from "../src/utils/subscriptionStatus";
import { ApiLogger } from "./apiLogger";
import { supabase } from "./supabaseClient";
import { FREE_LIFETIME_LIMIT } from "./tierConfig";

type DuplicateIpAutoPauseInput = {
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  source: string;
  currentProfile?: ProfileRow | null;
};

type ProfileRow = {
  id: string;
  email?: string | null;
  subscription_status?: string | null;
  subscription_tier?: string | null;
  account_status?: string | null;
  free_lifetime_generations_used?: number | null;
};

type LogRow = {
  user_id?: string | null;
  user_email?: string | null;
  endpoint?: string | null;
  response_status?: number | null;
  flagged_reason?: string | null;
  full_request_body?: any;
  created_at?: string | null;
};

const LOOKBACK_DAYS = 30;
const LOG_LIMIT = 100;
const INTERNAL_DUPLICATE_IP_EXCLUDED_EMAILS = new Set([
  "samicodesit@gmail.com",
]);

function isInternalDuplicateIpExcludedEmail(email?: string | null) {
  return INTERNAL_DUPLICATE_IP_EXCLUDED_EMAILS.has(
    String(email || "")
      .trim()
      .toLowerCase(),
  );
}

function isPublicIp(ipAddress: string) {
  const ip = ipAddress.trim().toLowerCase();
  if (!ip || ip === "unknown" || ip === "::1" || ip === "localhost") {
    return false;
  }
  if (
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.")
  ) {
    return false;
  }

  const secondOctet = Number(ip.split(".")[1]);
  if (ip.startsWith("172.") && secondOctet >= 16 && secondOctet <= 31) {
    return false;
  }

  if (
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:") ||
    ip.startsWith("::ffff:127.") ||
    ip.startsWith("::ffff:10.") ||
    ip.startsWith("::ffff:192.168.")
  ) {
    return false;
  }

  return true;
}

function isFreeProfile(profile?: ProfileRow | null) {
  if (!profile) return true;
  if (hasPaidEntitlementStatus(profile.subscription_status)) return false;
  return true;
}

function logShowsLimitHit(log: LogRow) {
  if (log.endpoint === "/event/generate_limit_hit") return true;
  if (log.flagged_reason === "Account paused") return true;
  const context = log.full_request_body?.context || {};
  return context.code === "free_lifetime_limit";
}

function profileShowsUsedFreeLimit(profile?: ProfileRow | null) {
  return (
    Number(profile?.free_lifetime_generations_used || 0) >= FREE_LIFETIME_LIMIT
  );
}

export async function detectAndPauseDuplicateIpAccount({
  userId,
  email,
  ipAddress,
  source,
  currentProfile: providedCurrentProfile,
}: DuplicateIpAutoPauseInput): Promise<{ paused: boolean; reason?: string }> {
  const normalizedUserId = String(userId || "").trim();
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedIp = String(ipAddress || "").trim();

  if (!normalizedUserId || !normalizedEmail || !isPublicIp(normalizedIp)) {
    return { paused: false };
  }

  let currentProfile = providedCurrentProfile;
  if (typeof providedCurrentProfile === "undefined") {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, subscription_status, subscription_tier, account_status, free_lifetime_generations_used",
      )
      .eq("id", normalizedUserId)
      .maybeSingle();

    if (error) {
      console.error("Failed to check duplicate IP current profile:", error);
      return { paused: false };
    }
    currentProfile = data as ProfileRow | null;
  }

  if (
    !currentProfile ||
    isInternalDuplicateIpExcludedEmail(normalizedEmail) ||
    isInternalDuplicateIpExcludedEmail(currentProfile.email) ||
    currentProfile?.account_status === "paused" ||
    !isFreeProfile(currentProfile as ProfileRow | null)
  ) {
    return { paused: false };
  }

  const sinceIso = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: logs, error: logsError } = await supabase
    .from("api_logs")
    .select(
      "user_id, user_email, endpoint, response_status, flagged_reason, full_request_body, created_at",
    )
    .eq("ip_address", normalizedIp)
    .neq("user_id", normalizedUserId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);

  if (logsError) {
    console.error("Failed to check duplicate IP logs:", logsError);
    return { paused: false };
  }

  const candidateIds = Array.from(
    new Set(
      ((logs || []) as LogRow[])
        .map((log) => log.user_id)
        .filter((id): id is string => Boolean(id && id !== normalizedUserId)),
    ),
  );
  if (!candidateIds.length) return { paused: false };

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select(
      "id, email, subscription_status, subscription_tier, account_status, free_lifetime_generations_used",
    )
    .in("id", candidateIds.slice(0, 50));

  if (profilesError) {
    console.error(
      "Failed to check duplicate IP candidate profiles:",
      profilesError,
    );
    return { paused: false };
  }

  const profileById = new Map(
    ((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const matchingLog = ((logs || []) as LogRow[]).find((log) => {
    if (!log.user_id || log.user_id === normalizedUserId) return false;
    const profile = profileById.get(log.user_id);
    if (
      isInternalDuplicateIpExcludedEmail(profile?.email) ||
      isInternalDuplicateIpExcludedEmail(log.user_email)
    ) {
      return false;
    }
    if (!isFreeProfile(profile)) return false;
    return (
      profile?.account_status === "paused" ||
      profileShowsUsedFreeLimit(profile) ||
      logShowsLimitHit(log)
    );
  });

  if (!matchingLog?.user_id) return { paused: false };

  const matchedProfile = profileById.get(matchingLog.user_id);
  const matchedLabel =
    matchedProfile?.email || matchingLog.user_email || matchingLog.user_id;
  const notes = `Auto-paused: same IP as prior free account ${matchedLabel} that exhausted free usage. Source: ${source}.`;

  const { error: pauseError } = await supabase
    .from("profiles")
    .update({
      account_status: "paused",
      abuse_reason: "duplicate_ip_signup",
      abuse_notes: notes,
      paused_at: new Date().toISOString(),
      paused_by: "system_ip_match",
    })
    .eq("id", normalizedUserId);

  if (pauseError) {
    console.error("Failed to auto-pause duplicate IP account:", pauseError);
    return { paused: false };
  }

  await ApiLogger.logRequest({
    requestMethod: "SYSTEM",
    endpoint: "/system/auto-pause-duplicate-ip",
    userId: normalizedUserId,
    userEmail: normalizedEmail,
    ipAddress: normalizedIp,
    responseStatus: 200,
    suspiciousActivity: true,
    flaggedReason: "duplicate_ip_signup",
    fullRequestBody: {
      source,
      matchedUserId: matchingLog.user_id,
      matchedEmail: matchedLabel,
    },
  });

  return { paused: true, reason: "duplicate_ip_signup" };
}
