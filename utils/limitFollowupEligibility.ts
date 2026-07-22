import { supabase } from "./supabaseClient";
import { FREE_LIFETIME_LIMIT } from "./tierConfig";
import { hasPaidEntitlementStatus } from "../src/utils/subscriptionStatus";

export type LimitFollowupRecipient = {
  id: string;
  email: string;
  unsubscribe_token: string;
  limitHitAt: string;
};

export const LIMIT_FOLLOWUP_COUPON_CODE = "LISTFASTER20";
export const LIMIT_FOLLOWUP_EXCLUDED_EMAILS = new Set([
  "samicodesit@gmail.com",
]);
export const LIMIT_FOLLOWUP_EXCLUSION_EVENT =
  "/event/limit_followup_email_excluded";
export const LIMIT_FOLLOWUP_EMAIL_SENT_EVENT =
  "/event/limit_followup_email_sent";

export function normalizeEmailForCampaign(email?: string | null) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function getLimitFollowupExcludedEmails(input: unknown) {
  const excludedEmails = new Set(LIMIT_FOLLOWUP_EXCLUDED_EMAILS);
  if (!Array.isArray(input)) return excludedEmails;

  for (const email of input) {
    const normalized = normalizeEmailForCampaign(String(email || ""));
    if (normalized && normalized.includes("@")) {
      excludedEmails.add(normalized);
    }
  }

  return excludedEmails;
}

export async function getPermanentLimitFollowupExclusions() {
  const excludedEmails = new Set<string>();
  const excludedUserIds = new Set<string>();

  const { data, error } = await supabase
    .from("api_logs")
    .select("user_id, user_email, full_request_body")
    .in("endpoint", [
      LIMIT_FOLLOWUP_EXCLUSION_EVENT,
      LIMIT_FOLLOWUP_EMAIL_SENT_EVENT,
    ])
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  for (const row of data || []) {
    if (row.user_id) excludedUserIds.add(String(row.user_id));
    const body = row.full_request_body || {};
    const email = normalizeEmailForCampaign(
      row.user_email || body?.context?.email || body?.email,
    );
    if (email) excludedEmails.add(email);
  }

  return { excludedEmails, excludedUserIds };
}

export async function getAllLimitFollowupExclusions(input: unknown) {
  const requestExcludedEmails = getLimitFollowupExcludedEmails(input);
  const permanent = await getPermanentLimitFollowupExclusions();

  for (const email of permanent.excludedEmails) {
    requestExcludedEmails.add(email);
  }

  return {
    excludedEmails: requestExcludedEmails,
    excludedUserIds: permanent.excludedUserIds,
  };
}

function getLimitFollowupLogEventName(row: {
  full_request_body?: any;
  endpoint?: string | null;
}) {
  const body = row.full_request_body || {};
  if (typeof body.event === "string") return body.event;
  if (typeof row.endpoint === "string" && row.endpoint.startsWith("/event/")) {
    return row.endpoint.slice("/event/".length);
  }
  return "";
}

function getLogEventContext(row: { full_request_body?: any }) {
  const body = row.full_request_body || {};
  return body && typeof body.context === "object" && body.context
    ? body.context
    : {};
}

export async function findLimitFollowupRecipients({
  sinceHours,
  minDelayMinutes,
  excludedEmails,
  excludedUserIds,
  userId,
  requireExplicitLimitHit = false,
}: {
  sinceHours: number;
  minDelayMinutes: number;
  excludedEmails: Set<string>;
  excludedUserIds: Set<string>;
  userId?: string;
  requireExplicitLimitHit?: boolean;
}) {
  const sinceIso = new Date(
    Date.now() - sinceHours * 60 * 60 * 1000,
  ).toISOString();
  const eligibleBeforeMs = Date.now() - minDelayMinutes * 60 * 1000;

  let limitQuery = supabase
    .from("api_logs")
    .select("user_id, user_email, endpoint, full_request_body, created_at")
    .eq("endpoint", "/event/generate_limit_hit")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(userId ? 50 : 1000);

  if (userId) {
    limitQuery = limitQuery.eq("user_id", userId);
  }

  const { data: limitRows, error: limitError } = await limitQuery;
  if (limitError) throw limitError;

  const latestLimitByUser = new Map<
    string,
    { userId: string; email?: string | null; limitHitAt: string }
  >();

  for (const row of limitRows || []) {
    const rowUserId = row.user_id as string | null;
    if (!rowUserId || latestLimitByUser.has(rowUserId)) continue;

    const context = getLogEventContext(row);
    const code = context.code || context.reason || null;
    if (code !== "free_lifetime_limit") continue;
    if (Date.parse(row.created_at as string) > eligibleBeforeMs) continue;

    latestLimitByUser.set(rowUserId, {
      userId: rowUserId,
      email: (row.user_email as string | null) || null,
      limitHitAt: row.created_at as string,
    });
  }

  if (!requireExplicitLimitHit) {
    let cappedProfilesQuery = supabase
      .from("profiles")
      .select("id, email, pack_credits")
      .gte("free_lifetime_generations_used", FREE_LIFETIME_LIMIT)
      .lte("pack_credits", 0)
      .eq("email_subscribed", true)
      .not("email", "is", null)
      .not("unsubscribe_token", "is", null)
      .limit(userId ? 1 : 2000);

    if (userId) {
      cappedProfilesQuery = cappedProfilesQuery.eq("id", userId);
    }

    const { data: cappedProfiles, error: cappedProfilesError } =
      await cappedProfilesQuery;

    if (cappedProfilesError) throw cappedProfilesError;

    const cappedUserIds = (
      (cappedProfiles || []) as Array<{
        id: string;
        email: string | null;
      }>
    )
      .map((profile) => profile.id)
      .filter((id) => id && !latestLimitByUser.has(id));

    if (cappedUserIds.length) {
      const { data: cappedActivity, error: cappedActivityError } =
        await supabase
          .from("api_logs")
          .select("user_id, user_email, endpoint, response_status, created_at")
          .in("user_id", cappedUserIds)
          .in("endpoint", ["/event/generate_success", "/api/generate"])
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(userId ? 50 : 3000);

      if (cappedActivityError) throw cappedActivityError;

      for (const row of cappedActivity || []) {
        const rowUserId = row.user_id as string | null;
        if (!rowUserId || latestLimitByUser.has(rowUserId)) continue;
        if (Date.parse(row.created_at as string) > eligibleBeforeMs) continue;
        if (
          row.endpoint === "/api/generate" &&
          Number(row.response_status) !== 200
        ) {
          continue;
        }

        latestLimitByUser.set(rowUserId, {
          userId: rowUserId,
          email: (row.user_email as string | null) || null,
          limitHitAt: row.created_at as string,
        });
      }
    }
  }

  const userIds = Array.from(latestLimitByUser.keys());
  if (!userIds.length) return [];

  const { data: laterEvents, error: laterEventsError } = await supabase
    .from("api_logs")
    .select("user_id, endpoint, full_request_body, created_at")
    .in("user_id", userIds)
    .in("endpoint", [
      "/event/extension_uninstalled",
      "/event/uninstall_feedback_submitted",
      LIMIT_FOLLOWUP_EMAIL_SENT_EVENT,
    ])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(userId ? 50 : 2000);

  if (laterEventsError) throw laterEventsError;

  const blockedUserIds = new Set<string>();
  for (const row of laterEvents || []) {
    const rowUserId = row.user_id as string | null;
    if (!rowUserId) continue;
    const limitHit = latestLimitByUser.get(rowUserId);
    if (!limitHit) continue;
    const event = getLimitFollowupLogEventName(row);
    // Campaign emails suppress future eligibility even if the user hits the limit again later.
    if (event === "limit_followup_email_sent") {
      blockedUserIds.add(rowUserId);
      continue;
    }

    if (
      Date.parse(row.created_at as string) < Date.parse(limitHit.limitHitAt)
    ) {
      continue;
    }
    if (
      event === "extension_uninstalled" ||
      event === "uninstall_feedback_submitted"
    ) {
      blockedUserIds.add(rowUserId);
    }
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, email, subscription_status, subscription_tier, email_subscribed, unsubscribe_token, pack_credits",
    )
    .in("id", userIds)
    .eq("email_subscribed", true)
    .lte("pack_credits", 0)
    .not("email", "is", null)
    .not("unsubscribe_token", "is", null);

  if (profileError) throw profileError;

  return (
    (profiles || []) as Array<{
      id: string;
      email: string | null;
      subscription_status: string | null;
      subscription_tier: string | null;
      email_subscribed: boolean | null;
      unsubscribe_token: string | null;
      pack_credits?: number | null;
    }>
  )
    .filter((profile) => {
      if (!profile.email || !profile.unsubscribe_token) return false;
      if (Number(profile.pack_credits || 0) > 0) return false;
      if (excludedUserIds.has(profile.id)) return false;
      if (excludedEmails.has(normalizeEmailForCampaign(profile.email))) {
        return false;
      }
      if (blockedUserIds.has(profile.id)) return false;
      return !hasPaidEntitlementStatus(profile.subscription_status);
    })
    .map((profile) => ({
      id: profile.id,
      email: profile.email as string,
      unsubscribe_token: profile.unsubscribe_token as string,
      limitHitAt: latestLimitByUser.get(profile.id)?.limitHitAt || "",
    }))
    .filter((recipient) => recipient.limitHitAt);
}
