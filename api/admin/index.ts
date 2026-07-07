import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { supabase } from "../../utils/supabaseClient";
import {
  FREE_LIFETIME_LIMIT,
  getEffectiveTier,
  getTierConfigForProfile,
} from "../../utils/tierConfig";
import { buildClearAccountPauseUpdate } from "../../src/utils/accountPause";
import {
  BRAND,
  TEMPLATES,
  wrapEmailLayout,
  getTemplateIndex,
  wrapTemplateLayout,
} from "../../utils/emailTemplates";
import { ApiLogger } from "../../utils/apiLogger";
import {
  estimateOpenAICostUsd,
  getBillableOpenAIModel,
} from "../../utils/openaiModelExperiment";
import { createPricingOfferUrl } from "../../utils/pricingOfferToken";
import {
  LIMIT_FOLLOWUP_COUPON_CODE,
  LIMIT_FOLLOWUP_EXCLUSION_EVENT,
  findLimitFollowupRecipients,
  getAllLimitFollowupExclusions,
  normalizeEmailForCampaign,
} from "../../utils/limitFollowupEligibility";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- AUTH with ADMIN_SECRET ---
  const action = req.query.action as string;
  const adminSecret = process.env.ADMIN_SECRET;
  const isLocalTemplatePreview =
    req.method === "GET" &&
    (action === "list-templates" || action === "preview-template") &&
    isLocalRequest(req);

  if (
    !isLocalTemplatePreview &&
    (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    if (action === "auth-check") {
      return res.status(200).json({ ok: true });
    } else if (action === "log-detail") {
      return handleLogDetail(req, res);
    } else if (action === "view-logs" || !action) {
      return handleViewLogs(req, res);
    } else if (action === "usage-stats") {
      return handleUsageStats(req, res);
    } else if (action === "growth-stats") {
      return handleGrowthStats(req, res);
    } else if (action === "list-users") {
      return handleListUsers(req, res);
    } else if (action === "user-journey") {
      return handleUserJourney(req, res);
    } else if (action === "list-templates") {
      return handleListTemplates(req, res);
    } else if (action === "preview-template") {
      return handlePreviewTemplate(req, res);
    } else {
      return res.status(400).json({ error: "Invalid GET action" });
    }
  } else if (req.method === "POST") {
    if (action === "emergency-brake") {
      return handleEmergencyBrake(req, res);
    } else if (action === "flag-activity") {
      return handleFlagActivity(req, res, "admin");
    } else if (action === "reset-usage") {
      return handleResetUsage(req, res);
    } else if (action === "set-account-status") {
      return handleSetAccountStatus(req, res);
    } else if (action === "send-campaign") {
      return handleSendCampaign(req, res);
    } else if (action === "send-limit-followup") {
      return handleSendLimitFollowup(req, res);
    } else if (action === "exclude-limit-followup") {
      return handleExcludeLimitFollowup(req, res);
    } else {
      return res.status(400).json({ error: "Invalid POST action" });
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}

function isLocalRequest(req: VercelRequest) {
  const host = String(req.headers.host || "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

type AdminUserSegment = "today" | "recent" | "active" | "paid" | "at-risk";
type AdminUserSort =
  | "created_desc"
  | "active_desc"
  | "usage_desc"
  | "email_asc";

type ProfileRow = {
  id: string;
  email: string | null;
  api_calls_this_month: number | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  created_at: string;
  current_period_end: string | null;
  is_legacy_plan?: boolean | null;
  free_lifetime_generations_used?: number | null;
  pack_credits?: number | null;
  custom_daily_limit?: number | null;
  custom_monthly_limit?: number | null;
  custom_limit_expires_at?: string | null;
  account_status?: string | null;
  abuse_reason?: string | null;
  abuse_notes?: string | null;
  paused_at?: string | null;
  paused_by?: string | null;
  email_subscribed?: boolean | null;
  unsubscribe_token?: string | null;
};

type RateLimitRow = {
  user_id: string;
  window_type: string;
  count: number | null;
  expires_at: string | null;
};

const PROFILE_SELECT =
  "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, account_status, abuse_reason, abuse_notes, paused_at, paused_by, email_subscribed, unsubscribe_token";

const LOG_SELECT =
  "id, user_id, user_email, endpoint, request_method, origin, ip_address, image_urls, raw_prompt, full_request_body, generated_title, generated_description, response_status, openai_model, openai_tokens_used, openai_prompt_tokens, openai_completion_tokens, openai_cached_tokens, subscription_tier, subscription_status, api_calls_count, created_at, processing_duration_ms, suspicious_activity, flagged_reason";

const LOG_LIST_SELECT =
  "id, user_id, user_email, endpoint, request_method, origin, ip_address, generated_title, response_status, openai_model, openai_tokens_used, openai_prompt_tokens, openai_completion_tokens, openai_cached_tokens, subscription_tier, subscription_status, api_calls_count, created_at, processing_duration_ms, suspicious_activity, flagged_reason";

const LOG_GENERATION_LIST_SELECT =
  "id, user_id, user_email, endpoint, request_method, origin, ip_address, generated_title, response_status, openai_model, openai_tokens_used, openai_prompt_tokens, openai_completion_tokens, openai_cached_tokens, subscription_tier, subscription_status, api_calls_count, created_at, processing_duration_ms, suspicious_activity, flagged_reason";

function getQueryString(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getAdminEffectiveLimit(
  user: ProfileRow,
  key: "daily" | "monthly",
  fallback: number | null,
) {
  const customValue =
    key === "daily" ? user.custom_daily_limit : user.custom_monthly_limit;
  const hasActiveCustomLimits =
    user.custom_limit_expires_at &&
    new Date(user.custom_limit_expires_at) > new Date();

  if (
    hasActiveCustomLimits &&
    typeof customValue === "number" &&
    customValue > 0
  ) {
    return customValue;
  }

  return fallback;
}

function parsePositiveInt(
  value: string | string[] | undefined,
  fallback: number,
  max: number,
) {
  const parsed = parseInt(getQueryString(value) || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeSegment(
  value: string | string[] | undefined,
): AdminUserSegment {
  const segment = getQueryString(value);
  if (
    segment === "today" ||
    segment === "recent" ||
    segment === "active" ||
    segment === "paid" ||
    segment === "at-risk"
  ) {
    return segment;
  }
  return "recent";
}

function normalizeSort(value: string | string[] | undefined): AdminUserSort {
  const sort = getQueryString(value);
  if (
    sort === "created_desc" ||
    sort === "active_desc" ||
    sort === "usage_desc" ||
    sort === "email_asc"
  ) {
    return sort;
  }
  return "created_desc";
}

function applyProfileFilters(query: any, req: VercelRequest) {
  const search = (getQueryString(req.query.search) || "").trim();
  const tier = (getQueryString(req.query.tier) || "all").trim();
  const status = (getQueryString(req.query.status) || "all").trim();

  if (search) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        search,
      );
    query = isUuid
      ? query.or(`email.ilike.%${search}%,id.eq.${search}`)
      : query.ilike("email", `%${search}%`);
  }

  if (tier !== "all") query = query.eq("subscription_tier", tier);
  if (status !== "all") query = query.eq("subscription_status", status);

  return query;
}

function matchesInMemoryFilters(user: ProfileRow, req: VercelRequest) {
  const search = (getQueryString(req.query.search) || "").trim().toLowerCase();
  const tier = (getQueryString(req.query.tier) || "all").trim();
  const status = (getQueryString(req.query.status) || "all").trim();

  if (search) {
    const email = (user.email || "").toLowerCase();
    const id = user.id.toLowerCase();
    if (!email.includes(search) && !id.includes(search)) return false;
  }

  if (tier !== "all" && user.subscription_tier !== tier) return false;
  if (status !== "all" && user.subscription_status !== status) return false;

  return true;
}

function applyProfileSort(
  query: any,
  sort: AdminUserSort,
  segment: AdminUserSegment,
) {
  if (sort === "usage_desc" || segment === "at-risk") {
    return query.order("api_calls_this_month", {
      ascending: false,
      nullsFirst: false,
    });
  }
  if (sort === "email_asc") {
    return query.order("email", { ascending: true, nullsFirst: false });
  }
  return query.order("created_at", { ascending: false });
}

function getLimitCount(limits: RateLimitRow[], windowType: string) {
  return limits
    .filter((limit) => limit.window_type === windowType)
    .reduce((total, limit) => total + (limit.count || 0), 0);
}

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function getEventName(log: any) {
  if (typeof log.endpoint === "string" && log.endpoint.startsWith("/event/")) {
    return log.endpoint.slice("/event/".length);
  }

  const body = log.full_request_body;
  if (body && typeof body === "object" && typeof body.event === "string") {
    return body.event;
  }

  return null;
}

function getEventCategory(event: string | null) {
  if (!event) return null;
  if (
    event === "extension_uninstalled" ||
    event === "uninstall_feedback_submitted" ||
    event === "chrome_store_click"
  ) {
    return "Acquisition Quality";
  }
  if (
    event.startsWith("generate_") ||
    event.startsWith("generation_") ||
    event.startsWith("phone_upload_") ||
    event.startsWith("batch_") ||
    event.startsWith("listing_report_") ||
    event === "account_paused_shown"
  ) {
    return "Product Usage";
  }
  if (
    event.startsWith("paywall_") ||
    event.startsWith("checkout_") ||
    event === "credit_pack_click" ||
    event === "credit_pack_paid" ||
    event === "subscription_started" ||
    event === "limit_followup_email_sent" ||
    event.startsWith("billing_portal_") ||
    event.startsWith("pricing_")
  ) {
    return "Revenue Intent";
  }
  if (
    event.startsWith("magic_link_") ||
    event.startsWith("auth_") ||
    event === "signin_cta_click" ||
    event === "signed_out_tools_ready" ||
    event === "listing_tools_ready"
  ) {
    return "Auth";
  }
  return "Other";
}

function getGrowthEmptyDay(date: string) {
  return {
    date,
    signups: 0,
    paidSignups: 0,
    activeGenerators: 0,
    successfulGenerations: 0,
    generateRequests: 0,
    generateClicks: 0,
    limitHits: 0,
    paywallShown: 0,
    checkoutStart: 0,
    checkoutOpened: 0,
    chromeStoreClicks: 0,
    magicLinkRequests: 0,
    phoneUploadStarts: 0,
    batchStarts: 0,
    uninstallFeedback: 0,
  };
}

function pctValue(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function sumGrowthDays(days: Array<ReturnType<typeof getGrowthEmptyDay>>) {
  const totals = getGrowthEmptyDay("total");
  for (const day of days) {
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      if (key === "date") continue;
      (totals[key] as number) += Number(day[key] || 0);
    }
  }
  return totals;
}

async function fetchAdminRows(
  table: string,
  columns: string,
  buildQuery?: (query: any) => any,
  maxRows = 10000,
) {
  const rows: any[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(from, from + 999);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function handleGrowthStats(req: VercelRequest, res: VercelResponse) {
  try {
    const days = parsePositiveInt(req.query.days, 30, 90);
    const now = new Date();
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    start.setUTCHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    const dayMap = new Map<string, ReturnType<typeof getGrowthEmptyDay>>();
    const activeGeneratorSets = new Map<string, Set<string>>();
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = dayKey(date);
      dayMap.set(key, getGrowthEmptyDay(key));
      activeGeneratorSets.set(key, new Set());
    }

    const [profiles, recentProfiles, logs] = await Promise.all([
      fetchAdminRows(
        "profiles",
        "id, created_at, subscription_status, subscription_tier, free_lifetime_generations_used",
      ),
      fetchAdminRows(
        "profiles",
        "id, created_at, subscription_status, subscription_tier, free_lifetime_generations_used",
        (query) => query.gte("created_at", startIso),
      ),
      fetchAdminRows(
        "api_logs",
        "user_id, endpoint, response_status, created_at, full_request_body",
        (query) =>
          query.gte("created_at", startIso).order("created_at", {
            ascending: false,
          }),
      ),
    ]);

    const paidProfiles = profiles.filter(
      (profile) =>
        profile.subscription_status === "active" &&
        profile.subscription_tier &&
        profile.subscription_tier !== "free",
    );
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    recentProfiles.forEach((profile) => {
      const bucket = dayMap.get(dayKey(profile.created_at));
      if (!bucket) return;
      bucket.signups += 1;
      if (
        profile.subscription_status === "active" &&
        profile.subscription_tier &&
        profile.subscription_tier !== "free"
      ) {
        bucket.paidSignups += 1;
      }
    });

    const eventCounts = new Map<string, number>();
    const eventCategoryCounts = new Map<string, number>();
    const uninstallReasonCounts = new Map<
      string,
      { reason: string; label: string; count: number }
    >();
    const recentImportantEvents: any[] = [];
    const activeUsers30 = new Set<string>();
    const activeDaysByUser = new Map<string, Set<string>>();
    const successfulGenerationsByUser = new Map<string, number>();
    const limitHitsByUser = new Map<string, number>();
    const lastSuccessfulGenerationByUser = new Map<string, string>();
    logs.forEach((log) => {
      const key = dayKey(log.created_at);
      const bucket = dayMap.get(key);
      if (!bucket) return;

      const status = Number(log.response_status);
      const event = getEventName(log);
      if (event) {
        eventCounts.set(event, (eventCounts.get(event) || 0) + 1);
        const category = getEventCategory(event);
        if (category) {
          eventCategoryCounts.set(
            category,
            (eventCategoryCounts.get(category) || 0) + 1,
          );
        }

        const body = log.full_request_body || {};
        const context =
          body && typeof body === "object" && typeof body.context === "object"
            ? body.context
            : {};

        if (event === "uninstall_feedback_submitted") {
          bucket.uninstallFeedback += 1;
          const reason = String(context.reason || "unknown");
          const label = String(context.reasonLabel || reason);
          const existing = uninstallReasonCounts.get(reason) || {
            reason,
            label,
            count: 0,
          };
          existing.count += 1;
          uninstallReasonCounts.set(reason, existing);
        }

        if (
          [
            "extension_uninstalled",
            "uninstall_feedback_submitted",
            "generate_error",
            "generate_limit_hit",
            "paywall_shown",
            "checkout_start",
            "checkout_opened",
            "listing_report_submitted",
          ].includes(event) &&
          recentImportantEvents.length < 20
        ) {
          recentImportantEvents.push({
            event,
            category,
            createdAt: log.created_at,
            userId: log.user_id || null,
            context,
            extensionVersion:
              body.extensionVersion || context.extensionVersion || null,
          });
        }
      }

      if (log.endpoint === "/api/generate") {
        if (log.user_id) {
          activeGeneratorSets.get(key)?.add(log.user_id);
          activeUsers30.add(log.user_id);
          if (status === 200) {
            const activeDays = activeDaysByUser.get(log.user_id) || new Set();
            activeDays.add(key);
            activeDaysByUser.set(log.user_id, activeDays);
            successfulGenerationsByUser.set(
              log.user_id,
              (successfulGenerationsByUser.get(log.user_id) || 0) + 1,
            );
            const existingLast = lastSuccessfulGenerationByUser.get(
              log.user_id,
            );
            if (!existingLast || log.created_at > existingLast) {
              lastSuccessfulGenerationByUser.set(log.user_id, log.created_at);
            }
          }
        }
        if (status === 200) bucket.successfulGenerations += 1;
        if (status === 429 || status === 403) {
          bucket.limitHits += 1;
          if (log.user_id) {
            limitHitsByUser.set(
              log.user_id,
              (limitHitsByUser.get(log.user_id) || 0) + 1,
            );
          }
        }
      }

      if (event === "generate_request") bucket.generateRequests += 1;
      if (event === "generate_click") bucket.generateClicks += 1;
      if (event === "generate_limit_hit") {
        bucket.limitHits += 1;
        if (log.user_id) {
          limitHitsByUser.set(
            log.user_id,
            (limitHitsByUser.get(log.user_id) || 0) + 1,
          );
        }
      }
      if (event === "paywall_shown") bucket.paywallShown += 1;
      if (event === "checkout_start") bucket.checkoutStart += 1;
      if (event === "checkout_opened") bucket.checkoutOpened += 1;
      if (event === "chrome_store_click") bucket.chromeStoreClicks += 1;
      if (event === "magic_link_request") bucket.magicLinkRequests += 1;
      if (event === "phone_upload_start") bucket.phoneUploadStarts += 1;
      if (event === "batch_start") bucket.batchStarts += 1;
    });

    for (const [key, users] of activeGeneratorSets.entries()) {
      const bucket = dayMap.get(key);
      if (bucket) bucket.activeGenerators = users.size;
    }

    const daily = Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const last7 = sumGrowthDays(daily.slice(-7));
    const last30 = sumGrowthDays(daily.slice(-30));
    const today = daily[daily.length - 1] || getGrowthEmptyDay(dayKey(now));
    const yesterday =
      daily[daily.length - 2] ||
      getGrowthEmptyDay(dayKey(new Date(now.getTime() - 864e5)));
    const repeatActiveUsers = Array.from(activeDaysByUser.values()).filter(
      (activeDays) => activeDays.size >= 2,
    ).length;
    const successfulGenerationUsers = Array.from(
      successfulGenerationsByUser.keys(),
    );
    const twoPlusGenerationUsers = successfulGenerationUsers.filter(
      (userId) => (successfulGenerationsByUser.get(userId) || 0) >= 2,
    ).length;
    const threePlusGenerationUsers = successfulGenerationUsers.filter(
      (userId) => (successfulGenerationsByUser.get(userId) || 0) >= 3,
    ).length;
    const quotaPressureUsers = Array.from(activeUsers30).filter(
      (userId) =>
        (successfulGenerationsByUser.get(userId) || 0) >= 3 ||
        (limitHitsByUser.get(userId) || 0) > 0 ||
        Number(profileById.get(userId)?.free_lifetime_generations_used || 0) >=
          3,
    ).length;
    const avgSuccessfulGenerationsPerActive = activeUsers30.size
      ? Math.round((last30.successfulGenerations / activeUsers30.size) * 10) /
        10
      : 0;
    const oneGenerationTargets = Array.from(activeDaysByUser.entries())
      .filter(([, activeDays]) => activeDays.size === 1)
      .map(([userId, activeDays]) => {
        const profile = profileById.get(userId);
        return {
          userId,
          email: profile?.email || null,
          tier: profile?.subscription_tier || "free",
          status: profile?.subscription_status || "unknown",
          activeDays: activeDays.size,
          successfulGenerations: successfulGenerationsByUser.get(userId) || 0,
          lastGeneratedAt: lastSuccessfulGenerationByUser.get(userId) || null,
          signedUpAt: profile?.created_at || null,
        };
      })
      .filter((user) => user.email)
      .sort((a, b) =>
        String(b.lastGeneratedAt || "").localeCompare(
          String(a.lastGeneratedAt || ""),
        ),
      )
      .slice(0, 10);

    return res.status(200).json({
      generatedAt: now.toISOString(),
      window: { days, start: startIso, end: now.toISOString() },
      totals: {
        profiles: profiles.length,
        activePaidProfiles: paidProfiles.length,
        activeGenerators: activeUsers30.size,
        repeatActiveUsers,
        twoPlusGenerationUsers,
        threePlusGenerationUsers,
        quotaPressureUsers,
        avgSuccessfulGenerationsPerActive,
      },
      today,
      yesterday,
      last7,
      last30,
      rates: {
        activationPerSignup30d: pctValue(
          last30.activeGenerators,
          last30.signups,
        ),
        repeatActive30d: pctValue(repeatActiveUsers, activeUsers30.size),
        twoPlusGeneration30d: pctValue(
          twoPlusGenerationUsers,
          activeUsers30.size,
        ),
        quotaPressure30d: pctValue(quotaPressureUsers, activeUsers30.size),
        limitHitsPerActiveGenerator30d: pctValue(
          last30.limitHits,
          activeUsers30.size,
        ),
        limitToPaywall30d: pctValue(last30.paywallShown, last30.limitHits),
        paywallToCheckout30d: pctValue(
          last30.checkoutStart,
          last30.paywallShown,
        ),
        checkoutOpenRate30d: pctValue(
          last30.checkoutOpened,
          last30.checkoutStart,
        ),
        signupToPaid30d: pctValue(last30.paidSignups, last30.signups),
      },
      daily,
      topEvents: Array.from(eventCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([event, count]) => ({ event, count })),
      eventSummary: {
        categories: Array.from(eventCategoryCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([category, count]) => ({ category, count })),
        uninstallReasons: Array.from(uninstallReasonCounts.values()).sort(
          (a, b) => b.count - a.count,
        ),
        recentImportantEvents,
      },
      oneGenerationTargets,
      notes: [
        "Chrome Web Store impressions, visitors, installs, uninstall rate, and rating count still need to be read from Chrome Web Store dashboard.",
        "TrustMRR/Stripe MRR and churn should remain the source of truth for revenue.",
      ],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

async function enrichAdminUsers(
  users: ProfileRow[],
  todayStart?: string,
  todayEnd?: string,
) {
  if (users.length === 0) return [];

  const ids = users.map((user) => user.id);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const [{ data: recentLogs }, { data: activeRateLimits }] = await Promise.all([
    supabase
      .from("api_logs")
      .select("user_id, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.min(ids.length * 25, 1000)),
    supabase
      .from("rate_limits")
      .select("user_id, window_type, count, expires_at")
      .in("user_id", ids)
      .or(`expires_at.gt.${nowIso},expires_at.is.null`),
  ]);

  const lastActiveMap = new Map<string, string>();
  const rateLimitMap = new Map<string, RateLimitRow[]>();

  (recentLogs || []).forEach((log: any) => {
    if (!log.user_id) return;
    if (!lastActiveMap.has(log.user_id)) {
      lastActiveMap.set(log.user_id, log.created_at);
    }
  });

  (activeRateLimits || []).forEach((limit: RateLimitRow) => {
    if (!rateLimitMap.has(limit.user_id)) rateLimitMap.set(limit.user_id, []);
    rateLimitMap.get(limit.user_id)?.push(limit);
  });

  return users.map((user) => {
    const { unsubscribe_token: unsubscribeToken, ...safeUser } = user;
    const tierKey = getEffectiveTier(user);
    const tierConfig = getTierConfigForProfile(user, "current");
    const limits = rateLimitMap.get(user.id) || [];
    const dayCount = getLimitCount(limits, "day");
    const monthCount = user.api_calls_this_month || 0;
    const maxDay = getAdminEffectiveLimit(
      user,
      "daily",
      tierConfig.limits.daily,
    );
    const maxMonth = getAdminEffectiveLimit(
      user,
      "monthly",
      tierConfig.limits.monthly,
    );
    const dayPercent = maxDay ? Math.round((dayCount / maxDay) * 100) : 0;
    const monthPercent = maxMonth
      ? Math.round((monthCount / maxMonth) * 100)
      : 0;
    const createdAt = new Date(user.created_at).getTime();
    const isNewToday = Boolean(
      todayStart &&
      todayEnd &&
      user.created_at >= todayStart &&
      user.created_at < todayEnd,
    );

    return {
      ...safeUser,
      subscription_tier: tierKey,
      subscription_status: user.subscription_status || "unknown",
      email_can_contact: Boolean(
        user.email && user.email_subscribed && unsubscribeToken,
      ),
      api_calls_this_month: monthCount,
      last_active: lastActiveMap.get(user.id) || null,
      limits,
      max_limits: {
        day: tierKey === "free" ? null : maxDay,
        month: tierKey === "free" ? FREE_LIFETIME_LIMIT : maxMonth,
      },
      usage: {
        day: tierKey === "free" ? null : dayCount,
        month:
          tierKey === "free"
            ? user.free_lifetime_generations_used || 0
            : monthCount,
        day_percent: dayPercent,
        month_percent:
          tierKey === "free"
            ? Math.round(
                ((user.free_lifetime_generations_used || 0) /
                  FREE_LIFETIME_LIMIT) *
                  100,
              )
            : monthPercent,
        month_remaining:
          tierKey === "free"
            ? Math.max(
                FREE_LIFETIME_LIMIT -
                  (user.free_lifetime_generations_used || 0),
                0,
              )
            : Math.max((maxMonth || 0) - monthCount, 0),
        pack_credits: user.pack_credits || 0,
      },
      days_since_signup: Math.max(
        0,
        Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)),
      ),
      is_new_today: isNewToday,
      is_at_risk: dayPercent >= 80 || monthPercent >= 80,
    };
  });
}

async function handleListUsers(req: VercelRequest, res: VercelResponse) {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10000);
    const limit = parsePositiveInt(req.query.limit, 50, 100);
    const offset = (page - 1) * limit;
    const segment = normalizeSegment(req.query.segment);
    const sort = normalizeSort(req.query.sort);
    const todayStart = getQueryString(req.query.today_start);
    const todayEnd = getQueryString(req.query.today_end);

    if (segment === "active") {
      const { data: recentLogs, error: logsError } = await supabase
        .from("api_logs")
        .select("user_id, created_at")
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (logsError) throw logsError;

      const orderedIds: string[] = [];
      (recentLogs || []).forEach((log: any) => {
        if (log.user_id && !orderedIds.includes(log.user_id)) {
          orderedIds.push(log.user_id);
        }
      });

      if (orderedIds.length === 0) {
        return res.status(200).json({
          users: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          segment,
        });
      }

      let activeQuery = supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .in("id", orderedIds.slice(0, 1000));
      activeQuery = applyProfileFilters(activeQuery, req);

      const { data: activeProfiles, error: profilesError } = await activeQuery;
      if (profilesError) throw profilesError;

      const activeOrder = new Map(orderedIds.map((id, index) => [id, index]));
      const filteredUsers = ((activeProfiles || []) as ProfileRow[])
        .filter((user) => matchesInMemoryFilters(user, req))
        .sort(
          (a, b) => (activeOrder.get(a.id) || 0) - (activeOrder.get(b.id) || 0),
        );
      const pageUsers = filteredUsers.slice(offset, offset + limit);

      return res.status(200).json({
        users: await enrichAdminUsers(pageUsers, todayStart, todayEnd),
        pagination: {
          page,
          limit,
          total: filteredUsers.length,
          totalPages: Math.ceil(filteredUsers.length / limit),
        },
        segment,
      });
    }

    if (segment === "at-risk") {
      let riskQuery = supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .order("api_calls_this_month", { ascending: false, nullsFirst: false })
        .limit(1000);
      riskQuery = applyProfileFilters(riskQuery, req);

      const { data: riskProfiles, error: riskError } = await riskQuery;
      if (riskError) throw riskError;

      const enriched = await enrichAdminUsers(
        (riskProfiles || []) as ProfileRow[],
        todayStart,
        todayEnd,
      );
      const atRiskUsers = enriched.filter((user) => user.is_at_risk);
      const pageUsers = atRiskUsers.slice(offset, offset + limit);

      return res.status(200).json({
        users: pageUsers,
        pagination: {
          page,
          limit,
          total: atRiskUsers.length,
          totalPages: Math.ceil(atRiskUsers.length / limit),
        },
        segment,
      });
    }

    let query = supabase
      .from("profiles")
      .select(PROFILE_SELECT, { count: "exact" });

    if (segment === "today" && todayStart && todayEnd) {
      query = query.gte("created_at", todayStart).lt("created_at", todayEnd);
    }

    if (segment === "paid") {
      query = query
        .neq("subscription_tier", "free")
        .eq("subscription_status", "active");
    }

    query = applyProfileFilters(query, req);
    query = applyProfileSort(query, sort, segment).range(
      offset,
      offset + limit - 1,
    );

    const { data: users, error, count } = await query;
    if (error) throw error;

    return res.status(200).json({
      users: await enrichAdminUsers(
        (users || []) as ProfileRow[],
        todayStart,
        todayEnd,
      ),
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      segment,
    });
  } catch (error: any) {
    console.error("Error listing admin users:", error);
    return res.status(500).json({ error: error.message });
  }
}

function getLogBody(log: any) {
  if (!log?.full_request_body) return {};
  if (typeof log.full_request_body === "string") {
    try {
      return JSON.parse(log.full_request_body);
    } catch {
      return {};
    }
  }
  return log.full_request_body;
}

function getLogEventName(log: any) {
  return typeof log?.endpoint === "string" && log.endpoint.startsWith("/event/")
    ? log.endpoint.replace("/event/", "")
    : log?.endpoint || "unknown";
}

function getLogAnalyticsClientId(log: any) {
  const body = getLogBody(log);
  return body?.context?.analyticsClientId || null;
}

async function attachCorrelatedUsersToLogs(logs: any[]) {
  const clientIds = Array.from(
    new Set((logs || []).map(getLogAnalyticsClientId).filter(Boolean)),
  );
  if (!clientIds.length) return logs || [];

  const { data, error } = await supabase
    .from("api_logs")
    .select("user_id, user_email, full_request_body, created_at")
    .in("full_request_body->context->>analyticsClientId", clientIds)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const userByClientId = new Map<string, any>();
  (data || []).forEach((log: any) => {
    const clientId = getLogAnalyticsClientId(log);
    if (!clientId || userByClientId.has(clientId)) return;
    if (!log.user_id && !log.user_email) return;
    userByClientId.set(clientId, {
      id: log.user_id || null,
      email: log.user_email || null,
      lastSeenAt: log.created_at || null,
    });
  });

  return (logs || []).map((log: any) => {
    const clientId = getLogAnalyticsClientId(log);
    const correlatedUser = clientId ? userByClientId.get(clientId) : null;
    return correlatedUser ? { ...log, correlated_user: correlatedUser } : log;
  });
}

function getJourneyStage(log: any) {
  const event = getLogEventName(log);
  if (event === "signed_out_tools_ready") return "Reached Vinted signed out";
  if (event === "signin_cta_click") return "Clicked sign in";
  if (event === "magic_link_request" || event === "magic_link_sent") {
    return "Email sign in";
  }
  if (event === "auth_success") return "Signed in";
  if (event === "auth_vinted_cta_click") return "Opened Vinted after auth";
  if (event === "auth_callback_exit") return "Left auth success page";
  if (event === "auth_plans_click") return "Viewed plans after auth";
  if (event === "listing_tools_ready") return "Tools loaded on Vinted";
  if (event === "generate_click") return "Clicked generate";
  if (event === "generate_request") return "Generation requested";
  if (event === "/api/generate") return "Generation API";
  if (event === "generate_success") return "Generated";
  if (event === "generation_output_edited") return "Edited generated output";
  if (event === "generate_missing_photo") return "No photo uploaded";
  if (event === "generate_error") return "Generation error";
  if (event === "generate_limit_hit") return "Limit hit";
  if (event === "account_paused_shown") return "Account paused shown";
  if (event === "phone_upload_start") return "Phone upload started";
  if (event === "phone_upload_send_summary") return "Phone upload sent";
  if (event === "phone_upload_complete") return "Phone upload completed";
  if (event === "phone_upload_error") return "Phone upload error";
  if (event === "batch_start") return "Batch started";
  if (event === "batch_complete") return "Batch completed";
  if (event === "batch_error") return "Batch error";
  if (event === "extension_uninstalled") return "Extension uninstalled";
  if (event === "uninstall_feedback_submitted") return "Uninstall feedback";
  return event;
}

function compactJourneyLog(log: any) {
  const body = getLogBody(log);
  const context = body?.context || null;
  return {
    id: log.id,
    created_at: log.created_at,
    endpoint: log.endpoint,
    event: getLogEventName(log),
    stage: getJourneyStage(log),
    user_id: log.user_id,
    user_email: log.user_email,
    response_status: log.response_status,
    origin: log.origin,
    ip_address: log.ip_address || null,
    page: body?.page || null,
    source: body?.source || null,
    context,
    analyticsClientId: context?.analyticsClientId || null,
    generated_title: log.generated_title || null,
    has_generated_description: Boolean(log.generated_description),
    image_count: (() => {
      try {
        if (typeof log.image_urls === "string")
          return JSON.parse(log.image_urls).length;
        if (Array.isArray(log.image_urls)) return log.image_urls.length;
      } catch {
        return 0;
      }
      return 0;
    })(),
  };
}

const JOURNEY_STEPS = [
  {
    key: "signed_out_vinted",
    label: "Reached Vinted",
    events: ["signed_out_tools_ready", "listing_tools_ready"],
  },
  {
    key: "signin_clicked",
    label: "Clicked sign in",
    events: [
      "signin_cta_click",
      "magic_link_request",
      "magic_link_sent",
      "auth_success",
    ],
  },
  {
    key: "auth_completed",
    label: "Signed in",
    events: ["auth_success"],
  },
  {
    key: "returned_to_vinted",
    label: "Returned to Vinted",
    events: ["auth_vinted_cta_click", "listing_tools_ready"],
  },
  {
    key: "tools_loaded",
    label: "Tools loaded",
    events: ["listing_tools_ready"],
  },
  {
    key: "generate_attempted",
    label: "Tried generate",
    events: [
      "generate_click",
      "generate_missing_photo",
      "generate_request",
      "/api/generate",
      "generate_success",
    ],
  },
  {
    key: "generated",
    label: "Got output",
    events: ["generate_success"],
  },
];

function getJourneySummary(events: any[]) {
  const eventNames = new Set(events.map((event) => event.event));
  const lastEvent = events[events.length - 1] || null;
  const latestUninstall = [...events]
    .reverse()
    .find(
      (event) =>
        event.event === "extension_uninstalled" ||
        event.event === "uninstall_feedback_submitted",
    );
  const uninstallReason =
    latestUninstall?.context?.reasonLabel || latestUninstall?.context?.reason;
  const latestPaused = [...events].reverse().find((event) => {
    return (
      event.event === "account_paused_shown" ||
      (event.event === "generate_limit_hit" &&
        event.context?.code === "account_paused")
    );
  });

  const steps = JOURNEY_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    complete: step.events.some((event) => eventNames.has(event)),
  }));

  let status = "No tracked activity";
  let tone = "neutral";

  if (latestUninstall) {
    status = uninstallReason
      ? `Uninstalled: ${uninstallReason}`
      : "Uninstalled";
    tone = "danger";
  } else if (latestPaused) {
    status = "Account paused shown";
    tone = "warning";
  } else if (eventNames.has("generate_success")) {
    status = "Generated successfully";
    tone = "success";
  } else if (eventNames.has("generate_limit_hit")) {
    status = "Hit usage limit";
    tone = "warning";
  } else if (eventNames.has("generate_error")) {
    status = "Generation error";
    tone = "danger";
  } else if (eventNames.has("generate_request")) {
    status = "Generation requested";
    tone = "warning";
  } else if (eventNames.has("generate_missing_photo")) {
    status = "Missing photos";
    tone = "warning";
  } else if (eventNames.has("generate_click")) {
    status = "Clicked generate";
    tone = "neutral";
  } else if (eventNames.has("listing_tools_ready")) {
    status = "Tools loaded";
    tone = "neutral";
  } else if (eventNames.has("auth_success")) {
    status = "Signed in";
    tone = "neutral";
  } else if (eventNames.has("signin_cta_click")) {
    status = "Clicked sign in";
    tone = "neutral";
  } else if (eventNames.has("signed_out_tools_ready")) {
    status = "Reached Vinted signed out";
    tone = "neutral";
  } else if (lastEvent) {
    status = lastEvent.stage || lastEvent.event || "Tracked activity";
  }

  return {
    status,
    tone,
    lastStage: lastEvent?.stage || null,
    steps,
  };
}

async function handleUserJourney(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = getQueryString(req.query.user_id);
    let email = getQueryString(req.query.email);
    const requestedClientId = getQueryString(req.query.analytics_client_id);
    const days = parsePositiveInt(req.query.days, 14, 90);
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    if (!userId && !email && !requestedClientId) {
      return res
        .status(400)
        .json({ error: "user_id, email, or analytics_client_id is required" });
    }

    let profile: ProfileRow | null = null;
    if (userId || email) {
      let profileQuery = supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .limit(1);
      profileQuery = userId
        ? profileQuery.eq("id", userId)
        : profileQuery.eq("email", email);
      const { data: profiles, error } = await profileQuery;
      if (error) throw error;
      profile = ((profiles || [])[0] || null) as ProfileRow | null;
      if (!email && profile?.email) email = profile.email;
    }

    const linkedFilters: string[] = [];
    if (userId) linkedFilters.push(`user_id.eq.${userId}`);
    if (email) linkedFilters.push(`user_email.eq.${email}`);

    let linkedLogs: any[] = [];
    if (linkedFilters.length) {
      const { data, error } = await supabase
        .from("api_logs")
        .select(LOG_SELECT)
        .or(linkedFilters.join(","))
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      linkedLogs = data || [];
    }

    const clientIds = new Set<string>();
    if (requestedClientId) clientIds.add(requestedClientId);
    linkedLogs.forEach((log) => {
      const clientId = getLogAnalyticsClientId(log);
      if (clientId) clientIds.add(clientId);
    });

    let correlatedLogs: any[] = [];
    if (clientIds.size) {
      const { data, error } = await supabase
        .from("api_logs")
        .select(LOG_SELECT)
        .in(
          "full_request_body->context->>analyticsClientId",
          Array.from(clientIds),
        )
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      correlatedLogs = data || [];
    }

    const deduped = new Map<string, any>();
    [...linkedLogs, ...correlatedLogs].forEach((log) => {
      if (log?.id) deduped.set(log.id, log);
    });

    const dedupedLogs = Array.from(deduped.values()).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const linkedUserIds = Array.from(
      new Set(dedupedLogs.map((log) => log.user_id).filter(Boolean)),
    );
    const linkedUserEmails = Array.from(
      new Set(dedupedLogs.map((log) => log.user_email).filter(Boolean)),
    );
    let linkedProfiles: ProfileRow[] = [];

    if (linkedUserIds.length || linkedUserEmails.length) {
      const linkedProfilesQuery = supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .limit(20);
      const profileFilters = [
        ...linkedUserIds.map((id) => `id.eq.${id}`),
        ...linkedUserEmails.map((linkedEmail) => `email.eq.${linkedEmail}`),
      ];
      const { data, error } = await linkedProfilesQuery.or(
        profileFilters.join(","),
      );
      if (error) throw error;
      linkedProfiles = (data || []) as ProfileRow[];
    }

    const profileById = new Map(linkedProfiles.map((item) => [item.id, item]));
    const profileByEmail = new Map(
      linkedProfiles
        .filter((item) => item.email)
        .map((item) => [item.email as string, item]),
    );
    const linkedUserMap = new Map<string, any>();
    dedupedLogs.forEach((log) => {
      const key = log.user_id || log.user_email;
      if (!key) return;
      const linkedProfile =
        (log.user_id && profileById.get(log.user_id)) ||
        (log.user_email && profileByEmail.get(log.user_email));
      const existing = linkedUserMap.get(key) || {
        id: linkedProfile?.id || log.user_id || null,
        email: linkedProfile?.email || log.user_email || null,
        subscription_tier: linkedProfile?.subscription_tier || null,
        subscription_status: linkedProfile?.subscription_status || null,
        eventCount: 0,
        firstSeenAt: log.created_at,
        lastSeenAt: log.created_at,
      };
      existing.eventCount += 1;
      existing.firstSeenAt =
        log.created_at < existing.firstSeenAt
          ? log.created_at
          : existing.firstSeenAt;
      existing.lastSeenAt =
        log.created_at > existing.lastSeenAt
          ? log.created_at
          : existing.lastSeenAt;
      linkedUserMap.set(key, existing);
    });

    const linkedUsers = Array.from(linkedUserMap.values()).sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt),
    );
    if (!profile && linkedUsers.length === 1) {
      const linkedUser = linkedUsers[0];
      profile =
        (linkedUser.id && profileById.get(linkedUser.id)) ||
        (linkedUser.email && profileByEmail.get(linkedUser.email)) ||
        ({
          id: linkedUser.id,
          email: linkedUser.email,
          subscription_tier: linkedUser.subscription_tier,
          subscription_status: linkedUser.subscription_status,
        } as ProfileRow);
    }

    const events = dedupedLogs.map(compactJourneyLog);

    const lastEvent = events[events.length - 1] || null;
    const journeySummary = getJourneySummary(events);

    return res.status(200).json({
      profile,
      linkedUsers,
      analyticsClientIds: Array.from(clientIds),
      summary: {
        days,
        eventCount: events.length,
        firstSeenAt: events[0]?.created_at || null,
        lastSeenAt: lastEvent?.created_at || null,
        dropoff: journeySummary.status,
        ...journeySummary,
      },
      events,
    });
  } catch (error: any) {
    console.error("Error loading user journey:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function getRelatedLogFilters(req: VercelRequest) {
  const relatedUserId = (
    getQueryString(req.query.related_user_id) || ""
  ).trim();
  let relatedEmail = (getQueryString(req.query.related_email) || "").trim();

  if (!relatedUserId && !relatedEmail) return null;

  if (relatedUserId && !relatedEmail) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", relatedUserId)
      .maybeSingle();
    if (error) throw error;
    relatedEmail = profile?.email || "";
  }

  const directFilters = [
    relatedUserId ? `user_id.eq.${relatedUserId}` : "",
    relatedEmail ? `user_email.eq.${relatedEmail}` : "",
  ].filter(Boolean);
  const allFilters = [...directFilters];

  if (directFilters.length) {
    const { data: linkedLogs, error } = await supabase
      .from("api_logs")
      .select("full_request_body")
      .or(directFilters.join(","))
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const clientIds = Array.from(
      new Set((linkedLogs || []).map(getLogAnalyticsClientId).filter(Boolean)),
    );
    clientIds.forEach((clientId) => {
      allFilters.push(
        `full_request_body->context->>analyticsClientId.eq.${clientId}`,
      );
    });
  }

  return allFilters.length ? allFilters.join(",") : null;
}

async function handleLogDetail(req: VercelRequest, res: VercelResponse) {
  try {
    const id = (getQueryString(req.query.id) || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const { data, error } = await supabase
      .from("api_logs")
      .select(LOG_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;

    return res.status(200).json({ log: data });
  } catch (error: any) {
    console.error("Error fetching log detail:", error);
    return res.status(500).json({ error: error.message });
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_PATTERN = /^[0-9a-f:.]{2,45}$/i;

function isLikelyIpSearch(value: string) {
  const search = value.trim();
  if (IPV4_PATTERN.test(search)) return true;
  return search.includes(":") && IPV6_PATTERN.test(search);
}

function buildLogSearchFilter(search: string) {
  const safeSearch = search.replace(/[%_,]/g, "\\$&");
  const filters = [
    `user_email.ilike.%${safeSearch}%`,
    `endpoint.ilike.%${safeSearch}%`,
  ];

  if (UUID_PATTERN.test(search)) {
    filters.push(
      `user_id.eq.${search}`,
      `full_request_body->context->>analyticsClientId.eq.${search}`,
    );
  }

  if (isLikelyIpSearch(search)) {
    filters.push(`ip_address.eq.${search}`);
  }

  return filters.join(",");
}

// --- LOGIC: View Logs ---
async function handleViewLogs(req: VercelRequest, res: VercelResponse) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;

    const suspiciousOnly = req.query.suspicious === "true";
    const userId = req.query.user_id as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const logType = (req.query.log_type as string) || "generation";
    const search = (getQueryString(req.query.search) || "").trim();
    const statusFilter = getQueryString(req.query.status_filter) || "all";
    const relatedLogFilters = await getRelatedLogFilters(req);

    const applyLogTypeFilter = (query: any) => {
      if (logType === "all") return query;
      if (logType === "events") return query.like("endpoint", "/event/%");
      if (logType === "system") {
        return query
          .neq("endpoint", "/api/generate")
          .not("endpoint", "like", "/event/%");
      }
      return query.eq("endpoint", "/api/generate");
    };

    const logListSelect: string =
      logType === "generation" ? LOG_GENERATION_LIST_SELECT : LOG_LIST_SELECT;

    let query = applyLogTypeFilter(
      supabase
        .from("api_logs")
        .select(logListSelect)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
    );

    if (suspiciousOnly) query = query.eq("suspicious_activity", true);
    if (statusFilter === "error") query = query.gte("response_status", 400);
    if (statusFilter === "flagged")
      query = query.eq("suspicious_activity", true);
    if (userId) query = query.eq("user_id", userId);
    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", endDate);
    if (relatedLogFilters) {
      query = query.or(relatedLogFilters);
    } else if (search) {
      query = query.or(buildLogSearchFilter(search));
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error("Error fetching logs:", logsError);
      return res.status(500).json({ error: "Failed to fetch logs" });
    }

    let countQuery = applyLogTypeFilter(
      supabase.from("api_logs").select("id", { count: "exact", head: true }),
    );

    if (suspiciousOnly) countQuery = countQuery.eq("suspicious_activity", true);
    if (statusFilter === "error")
      countQuery = countQuery.gte("response_status", 400);
    if (statusFilter === "flagged")
      countQuery = countQuery.eq("suspicious_activity", true);
    if (userId) countQuery = countQuery.eq("user_id", userId);
    if (startDate) countQuery = countQuery.gte("created_at", startDate);
    if (endDate) countQuery = countQuery.lte("created_at", endDate);
    if (relatedLogFilters) {
      countQuery = countQuery.or(relatedLogFilters);
    } else if (search) {
      countQuery = countQuery.or(buildLogSearchFilter(search));
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      console.error("Error counting logs:", countError);
      return res.status(500).json({ error: "Failed to count logs" });
    }

    const enrichedLogs = attachOpenAICostsToLogs(
      await attachCorrelatedUsersToLogs(logs || []),
    );

    return res.status(200).json({
      logs: enrichedLogs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: Usage Stats ---
type OpenAICostLog = {
  created_at: string;
  endpoint?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  response_status?: number | null;
  openai_model?: string | null;
  openai_tokens_used?: number | null;
  openai_prompt_tokens?: number | null;
  openai_completion_tokens?: number | null;
  openai_cached_tokens?: number | null;
};

function getLogEstimatedOpenAICost(log: OpenAICostLog) {
  return estimateOpenAICostUsd({
    model: log.openai_model,
    promptTokens: log.openai_prompt_tokens,
    completionTokens: log.openai_completion_tokens,
    cachedTokens: log.openai_cached_tokens,
    totalTokens: log.openai_tokens_used,
  });
}

function attachOpenAICostsToLogs<T extends OpenAICostLog>(logs: T[]) {
  return logs.map((log) => {
    const estimatedCost = getLogEstimatedOpenAICost(log);
    return {
      ...log,
      openai_billable_model: getBillableOpenAIModel(log.openai_model) || null,
      openai_estimated_cost_usd: estimatedCost,
      openai_cost_known: typeof estimatedCost === "number",
    };
  });
}

async function fetchOpenAICostLogsForWindow(windowStartIso: string) {
  const pageSize = 1000;
  const logs: OpenAICostLog[] = [];
  let page = 0;
  let pagesFetched = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("api_logs")
      .select(
        "created_at, user_id, user_email, response_status, openai_model, openai_tokens_used, openai_prompt_tokens, openai_completion_tokens, openai_cached_tokens",
      )
      .eq("endpoint", "/api/generate")
      .gte("created_at", windowStartIso)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const pageLogs = (data || []) as OpenAICostLog[];
    logs.push(...pageLogs);
    if (pageLogs.length > 0) {
      pagesFetched += 1;
    }

    if (pageLogs.length < pageSize) {
      return {
        logs,
        pageSize,
        pagesFetched,
      };
    }

    page += 1;
  }
}

function buildOpenAICostSummary(
  logs: OpenAICostLog[],
  days: number,
  options: { pageSize?: number; pagesFetched?: number } = {},
) {
  const dailyMap = new Map();
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    dailyMap.set(dateStr, {
      date: dateStr,
      generation_count: 0,
      openai_call_count: 0,
      no_openai_call_count: 0,
      cost_usd: 0,
      tokens: 0,
    });
  }

  const modelMap = new Map();
  const userMap = new Map();
  const unknownModelMap = new Map();
  const noOpenAIStatusMap = new Map();
  const noOpenAIReasonMap = new Map();
  let totalCostUsd = 0;
  let totalTokens = 0;
  let openaiCallCount = 0;
  let noOpenAICallCount = 0;
  let costedGenerations = 0;
  let unknownCostGenerations = 0;
  let latestUnknownCostLog: any = null;
  let latestNoOpenAICallLog: any = null;

  logs.forEach((log) => {
    const dateStr = String(log.created_at || "").split("T")[0];
    const tokens = Number(log.openai_tokens_used || 0);
    const hasOpenAIUsage =
      tokens > 0 ||
      Number(log.openai_prompt_tokens || 0) > 0 ||
      Number(log.openai_completion_tokens || 0) > 0;
    const cost = getLogEstimatedOpenAICost(log);
    const model = getBillableOpenAIModel(log.openai_model) || "unknown";

    totalTokens += tokens;
    if (dailyMap.has(dateStr)) {
      const daily = dailyMap.get(dateStr);
      daily.generation_count += 1;
      daily.tokens += tokens;
      if (hasOpenAIUsage) {
        daily.openai_call_count += 1;
      } else {
        daily.no_openai_call_count += 1;
      }
      if (typeof cost === "number") daily.cost_usd += cost;
    }

    if (!hasOpenAIUsage) {
      noOpenAICallCount += 1;
      const status = String(log.response_status || "unknown");
      noOpenAIStatusMap.set(status, (noOpenAIStatusMap.get(status) || 0) + 1);

      const reason =
        Number(log.response_status) === 429
          ? "Rate limit exceeded"
          : Number(log.response_status) === 403
            ? "Forbidden or paused"
            : Number(log.response_status) === 401
              ? "Unauthorized"
              : Number(log.response_status) === 405
                ? "Method not allowed"
                : "No OpenAI call";
      noOpenAIReasonMap.set(reason, (noOpenAIReasonMap.get(reason) || 0) + 1);

      if (
        !latestNoOpenAICallLog?.created_at ||
        String(log.created_at || "") > String(latestNoOpenAICallLog.created_at)
      ) {
        latestNoOpenAICallLog = {
          created_at: log.created_at || null,
          user_email: log.user_email || null,
          user_id: log.user_id || null,
          response_status: log.response_status || null,
          reason,
        };
      }

      return;
    }

    openaiCallCount += 1;

    if (!modelMap.has(model)) {
      modelMap.set(model, {
        model,
        generation_count: 0,
        cost_usd: 0,
        tokens: 0,
        unknown_cost_count: 0,
      });
    }
    const modelEntry = modelMap.get(model);
    modelEntry.generation_count += 1;
    modelEntry.tokens += tokens;

    const userKey = log.user_email || log.user_id || "unknown";
    if (!userMap.has(userKey)) {
      userMap.set(userKey, {
        user_email: log.user_email || null,
        user_id: log.user_id || null,
        generation_count: 0,
        cost_usd: 0,
        tokens: 0,
        unknown_cost_count: 0,
      });
    }
    const userEntry = userMap.get(userKey);
    userEntry.generation_count += 1;
    userEntry.tokens += tokens;

    if (typeof cost === "number") {
      totalCostUsd += cost;
      costedGenerations += 1;
      modelEntry.cost_usd += cost;
      userEntry.cost_usd += cost;
    } else {
      unknownCostGenerations += 1;
      modelEntry.unknown_cost_count += 1;
      userEntry.unknown_cost_count += 1;

      if (!unknownModelMap.has(model)) {
        unknownModelMap.set(model, {
          model,
          generation_count: 0,
          tokens: 0,
          latest_created_at: null,
          latest_user_email: null,
          latest_user_id: null,
          latest_response_status: null,
        });
      }

      const unknownEntry = unknownModelMap.get(model);
      unknownEntry.generation_count += 1;
      unknownEntry.tokens += tokens;
      if (
        !unknownEntry.latest_created_at ||
        String(log.created_at || "") > unknownEntry.latest_created_at
      ) {
        unknownEntry.latest_created_at = log.created_at || null;
        unknownEntry.latest_user_email = log.user_email || null;
        unknownEntry.latest_user_id = log.user_id || null;
        unknownEntry.latest_response_status = log.response_status || null;
      }

      if (
        !latestUnknownCostLog?.created_at ||
        String(log.created_at || "") > String(latestUnknownCostLog.created_at)
      ) {
        latestUnknownCostLog = {
          created_at: log.created_at || null,
          model,
          user_email: log.user_email || null,
          user_id: log.user_id || null,
          response_status: log.response_status || null,
          tokens,
        };
      }
    }
  });

  const daily = Array.from(dailyMap.values()).sort((a: any, b: any) =>
    a.date.localeCompare(b.date),
  );
  const modelBreakdown = Array.from(modelMap.values())
    .map((entry: any) => ({
      ...entry,
      avg_cost_usd: entry.generation_count
        ? entry.cost_usd / entry.generation_count
        : 0,
    }))
    .sort((a: any, b: any) => b.cost_usd - a.cost_usd);
  const topUsers = Array.from(userMap.values())
    .map((entry: any) => ({
      ...entry,
      avg_cost_usd: entry.generation_count
        ? entry.cost_usd / entry.generation_count
        : 0,
    }))
    .sort((a: any, b: any) => b.cost_usd - a.cost_usd)
    .slice(0, 6);
  const unknownModelBreakdown = Array.from(unknownModelMap.values()).sort(
    (a: any, b: any) => b.generation_count - a.generation_count,
  );
  const noOpenAIStatusBreakdown = Array.from(noOpenAIStatusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a: any, b: any) => b.count - a.count);
  const noOpenAIReasonBreakdown = Array.from(noOpenAIReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a: any, b: any) => b.count - a.count);
  return {
    windowDays: days,
    windowStartDate: daily[0]?.date || null,
    windowEndDate: daily[daily.length - 1]?.date || null,
    pageSize: options.pageSize || null,
    pagesFetched: options.pagesFetched || null,
    exactGenerationLogCount: logs.length,
    analyzedGenerationLogCount: logs.length,
    isTruncated: false,
    generatedAt: new Date().toISOString(),
    generationCount: logs.length,
    openaiCallCount,
    noOpenAICallCount,
    noOpenAIStatusBreakdown,
    noOpenAIReasonBreakdown,
    latestNoOpenAICallLog,
    costedGenerations,
    unknownCostGenerations,
    totalCostUsd,
    totalTokens,
    avgCostPerGenerationUsd: costedGenerations
      ? totalCostUsd / costedGenerations
      : 0,
    projectedMonthlyCostUsd: days ? (totalCostUsd / days) * 30 : 0,
    daily,
    modelBreakdown,
    topUsers,
    unknownModelBreakdown,
    latestUnknownCostLog,
  };
}

async function handleUsageStats(req: VercelRequest, res: VercelResponse) {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const todayStart = getQueryString(req.query.today_start);
    const todayEnd = getQueryString(req.query.today_end);

    const { data: todayStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", todayStr)
      .single();

    let todayUsage = {
      totalRequests: todayStats?.total_api_calls || 0,
      generationRequests: todayStats?.total_api_calls || 0,
      pricedGenerations: 0,
      eventLogs: 0,
      totalTokens: 0,
      rateLimitErrors: 0,
      avgTokensPerRequest: 0,
      estimatedCost: todayStats?.estimated_cost || 0,
    };

    if (todayStart && todayEnd) {
      const { data: todayLogs, error: todayLogsError } = await supabase
        .from("api_logs")
        .select(
          "endpoint, openai_model, openai_tokens_used, openai_prompt_tokens, openai_completion_tokens, openai_cached_tokens, response_status, created_at",
        )
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd);

      if (todayLogsError) throw todayLogsError;

      const logs = todayLogs || [];
      const generationLogs = logs.filter(
        (log: any) => log.endpoint === "/api/generate",
      );
      const eventLogs = logs.filter(
        (log: any) =>
          typeof log.endpoint === "string" &&
          log.endpoint.startsWith("/event/"),
      );
      const totalTokens = logs.reduce(
        (sum: number, log: any) => sum + (log.openai_tokens_used || 0),
        0,
      );
      const pricedGenerationLogs = generationLogs.filter(
        (log: any) => typeof getLogEstimatedOpenAICost(log) === "number",
      );

      todayUsage = {
        totalRequests: logs.length,
        generationRequests: generationLogs.length,
        pricedGenerations: pricedGenerationLogs.length,
        eventLogs: eventLogs.length,
        totalTokens,
        rateLimitErrors: logs.filter((log: any) => log.response_status === 429)
          .length,
        avgTokensPerRequest: generationLogs.length
          ? Math.round(totalTokens / generationLogs.length)
          : 0,
        estimatedCost: generationLogs.reduce(
          (sum: number, log: any) => sum + (getLogEstimatedOpenAICost(log) || 0),
          0,
        ),
      };
    }

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split("T")[0];

    const { data: logsLastWeek } = await supabase
      .from("api_logs")
      .select(
        "created_at, openai_model, openai_tokens_used, openai_prompt_tokens, openai_completion_tokens, openai_cached_tokens",
      )
      .gte("created_at", `${weekAgoStr}T00:00:00Z`);

    const dailyMap = new Map();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyMap.set(dateStr, {
        date: dateStr,
        total_api_calls: 0,
        estimated_cost: 0,
      });
    }

    if (logsLastWeek) {
      logsLastWeek.forEach((log) => {
        const dateStr = log.created_at.split("T")[0];
        if (dailyMap.has(dateStr)) {
          const entry = dailyMap.get(dateStr);
          entry.total_api_calls++;
          entry.estimated_cost += getLogEstimatedOpenAICost(log) || 0;
        }
      });
    }

    const weekStats = Array.from(dailyMap.values()).sort((a: any, b: any) =>
      b.date.localeCompare(a.date),
    );

    const costWindowDays = 30;
    const costWindowStart = new Date(now);
    costWindowStart.setUTCDate(costWindowStart.getUTCDate() - (costWindowDays - 1));
    costWindowStart.setUTCHours(0, 0, 0, 0);
    const costLogWindow = await fetchOpenAICostLogsForWindow(
      costWindowStart.toISOString(),
    );

    const openaiCostSummary = buildOpenAICostSummary(
      costLogWindow.logs,
      costWindowDays,
      {
        pageSize: costLogWindow.pageSize,
        pagesFetched: costLogWindow.pagesFetched,
      },
    );

    // 1. Get recent activity timestamps to sort users
    const { data: recentLogs } = await supabase
      .from("api_logs")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    const lastActiveMap = new Map();
    if (recentLogs) {
      recentLogs.forEach((log) => {
        if (!lastActiveMap.has(log.user_id)) {
          lastActiveMap.set(log.user_id, log.created_at);
        }
      });
    }

    const { data: allUsers } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: topUsersByUsage } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .order("api_calls_this_month", { ascending: false })
      .limit(50);

    // Fetch profiles for recently active users
    const recentUserIds = Array.from(lastActiveMap.keys());
    let recentUsers: any[] = [];
    if (recentUserIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .in("id", recentUserIds);
      recentUsers = data || [];
    }

    const allUserMap = new Map();
    [...(allUsers || []), ...(topUsersByUsage || []), ...recentUsers].forEach(
      (user) => {
        if (user.email) allUserMap.set(user.email, user);
      },
    );

    const combinedUsers = Array.from(allUserMap.values());

    const nowIso = new Date().toISOString();
    const { data: allRateLimits } = await supabase
      .from("rate_limits")
      .select("user_id, window_type, count, expires_at")
      .or(`expires_at.gt.${nowIso},expires_at.is.null`);

    const rateLimitMap = new Map();
    if (allRateLimits) {
      allRateLimits.forEach((rl) => {
        if (!rateLimitMap.has(rl.user_id)) rateLimitMap.set(rl.user_id, []);
        rateLimitMap.get(rl.user_id).push(rl);
      });
    }

    const enrichedUsers = combinedUsers.map((user: any) => {
      const limits = rateLimitMap.get(user.id) || [];
      const tierConfig = getTierConfigForProfile(user);
      const maxDay = getAdminEffectiveLimit(
        user,
        "daily",
        tierConfig.limits.daily,
      );
      const maxMonth = getAdminEffectiveLimit(
        user,
        "monthly",
        tierConfig.limits.monthly,
      );
      return {
        ...user,
        last_active: lastActiveMap.get(user.id) || user.created_at,
        limits,
        max_limits: {
          day: maxDay,
          month: maxMonth,
        },
      };
    });

    // Get total user count
    const { count: totalUserCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    // Sort by last_active descending for recent activity view
    const recentActivityUsers = [...enrichedUsers].sort((a: any, b: any) =>
      b.last_active.localeCompare(a.last_active),
    );

    // Sort by created_at descending for recent signups view
    const recentSignups = [...enrichedUsers].sort((a: any, b: any) =>
      b.created_at.localeCompare(a.created_at),
    );

    // Sort by api_calls_this_month descending for top users by usage
    const topUsersByUsageList = [...enrichedUsers].sort(
      (a: any, b: any) =>
        (b.api_calls_this_month || 0) - (a.api_calls_this_month || 0),
    );

    return res.status(200).json({
      today: todayUsage,
      lastWeek: weekStats,
      openaiCostSummary,
      totalUsers: totalUserCount || 0,
      recentActivity: recentActivityUsers,
      recentSignups: recentSignups,
      topUsersByUsage: topUsersByUsageList,
      // Deprecated fields for backwards compatibility
      topUsers: recentActivityUsers,
      todaysUsage: recentActivityUsers,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: Emergency Brake ---
async function handleEmergencyBrake(req: VercelRequest, res: VercelResponse) {
  const { reason } = req.body; // 'action' is used as query param for routing; body.action carries enable/disable
  const brakeAction = req.body.action;

  try {
    if (brakeAction === "enable") {
      await supabase.from("system_settings").upsert({
        key: "emergency_brake",
        value: "true",
        reason: reason || "Manual activation",
        updated_at: new Date().toISOString(),
      });
      return res.status(200).json({
        success: true,
        message: "Emergency brake enabled",
        reason,
      });
    } else if (brakeAction === "disable") {
      await supabase.from("system_settings").upsert({
        key: "emergency_brake",
        value: "false",
        reason: reason || "Manual deactivation",
        updated_at: new Date().toISOString(),
      });
      return res.status(200).json({
        success: true,
        message: "Emergency brake disabled",
        reason,
      });
    } else {
      return res
        .status(400)
        .json({ error: "Invalid brake action. Use 'enable' or 'disable'" });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: Flag Activity ---
async function handleFlagActivity(
  req: VercelRequest,
  res: VercelResponse,
  _adminId: string,
) {
  const { logId, reason } = req.body;
  if (!logId) return res.status(400).json({ error: "Missing logId" });

  try {
    const { error } = await supabase
      .from("api_logs")
      .update({
        suspicious_activity: true,
        flagged_reason: reason || "Manual admin flag",
      })
      .eq("id", logId);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: Reset Usage ---
async function handleResetUsage(req: VercelRequest, res: VercelResponse) {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    // 1. Reset rate limits (daily/minute)
    const { error: rateLimitError } = await supabase
      .from("rate_limits")
      .delete()
      .eq("user_id", userId);

    if (rateLimitError) throw rateLimitError;

    // 2. Reset monthly usage in profile
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ api_calls_this_month: 0 })
      .eq("id", userId);

    if (profileError) throw profileError;

    return res.status(200).json({ success: true, message: "User usage reset" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: Pause / Unpause Account ---
async function handleSetAccountStatus(req: VercelRequest, res: VercelResponse) {
  const { userId, status, reason, notes } = req.body || {};
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "Missing userId" });
  }
  if (status !== "active" && status !== "paused") {
    return res.status(400).json({ error: "Invalid account status" });
  }

  try {
    const update =
      status === "paused"
        ? {
            account_status: "paused",
            abuse_reason: reason || "duplicate_free_quota_abuse",
            abuse_notes: String(notes || "").trim(),
            paused_at: new Date().toISOString(),
            paused_by: "admin",
          }
        : buildClearAccountPauseUpdate();

    if (status === "paused" && !update.abuse_notes) {
      return res.status(400).json({ error: "Pause notes are required" });
    }

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: status === "paused" ? "Account paused" : "Account unpaused",
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: List Templates ---
async function handleListTemplates(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ templates: getTemplateIndex() });
}

// --- LOGIC: Preview Template (returns rendered HTML) ---
async function handlePreviewTemplate(req: VercelRequest, res: VercelResponse) {
  const key = req.query.key as string;

  if (!key || !TEMPLATES[key]) {
    return res.status(400).json({
      error: `Unknown template key. Available: ${Object.keys(TEMPLATES).join(", ")}`,
    });
  }

  const template = TEMPLATES[key];
  const demoUnsubUrl =
    "https://autolister.app/api/unsubscribe?token=00000000-0000-0000-0000-000000000000";
  const html = wrapTemplateLayout(
    template,
    renderEmailTemplateVariables(template.body, {
      email: "charlotte.lefevre.1807@hotmail.com",
      allowUnsignedFallback: isLocalRequest(req),
    }),
    demoUnsubUrl,
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

// --- LOGIC: Send Email Campaign ---
async function handleSendCampaign(req: VercelRequest, res: VercelResponse) {
  const {
    template_key,
    custom_subject,
    custom_preheader,
    custom_html,
    test_email,
    recipient_emails, // NEW: array of specific emails to send to
  } = req.body;

  try {
    // Determine content
    let subject: string;
    let preheader: string;
    let bodyHtml: string;

    if (template_key && TEMPLATES[template_key]) {
      const tpl = TEMPLATES[template_key];
      if (tpl.layout === "direct" && !test_email) {
        return res.status(400).json({
          error:
            "Direct-reply templates are preview/test only and cannot be sent as campaigns.",
        });
      }
      subject = custom_subject || tpl.subject;
      preheader = custom_preheader || tpl.preheader;
      bodyHtml = tpl.body;
    } else if (custom_subject && custom_html) {
      subject = custom_subject;
      preheader = custom_preheader || "";
      bodyHtml = custom_html;
    } else {
      return res.status(400).json({
        error:
          'Provide either "template_key" or ("custom_subject" + "custom_html")',
        available_templates: Object.keys(TEMPLATES),
      });
    }

    // MODE 1: Test mode (single test email with dummy unsubscribe)
    if (test_email) {
      const demoUnsubUrl =
        "https://autolister.app/api/unsubscribe?token=00000000-0000-0000-0000-000000000000";
      const html = wrapEmailLayout(
        renderEmailTemplateVariables(bodyHtml, { email: test_email }),
        preheader,
        demoUnsubUrl,
      );

      await resend.emails.send({
        from: BRAND.from,
        to: test_email,
        subject: `[TEST] ${subject}`,
        html,
        headers: {
          "List-Unsubscribe": `<mailto:unsubscribe@autolister.app?subject=Unsubscribe>, <${demoUnsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      return res.status(200).json({
        mode: "test",
        sent_to: test_email,
        subject: `[TEST] ${subject}`,
      });
    }

    // MODE 2: Specific recipients (fetch only those emails from DB)
    let users;
    if (
      recipient_emails &&
      Array.isArray(recipient_emails) &&
      recipient_emails.length > 0
    ) {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("email, unsubscribe_token, email_subscribed")
        .in("email", recipient_emails)
        .eq("email_subscribed", true)
        .not("unsubscribe_token", "is", null);

      if (fetchError) throw fetchError;
      users = data || [];

      if (users.length === 0) {
        return res.status(200).json({
          mode: "specific",
          message: "None of the provided emails found in database.",
          requested: recipient_emails,
        });
      }
    } else {
      // MODE 3: Bulk (all subscribed users)
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("email, unsubscribe_token, email_subscribed")
        .eq("email_subscribed", true)
        .not("email", "is", null);

      if (fetchError) throw fetchError;
      users = data || [];

      if (users.length === 0) {
        return res.status(200).json({
          mode: "bulk",
          message: "No subscribed users found.",
        });
      }
    }

    // Send to all selected users
    const results: Array<{
      email: string;
      status: string;
      error?: string;
      subscribed?: boolean;
    }> = [];

    for (const user of users) {
      const unsubUrl = `https://autolister.app/api/unsubscribe?token=${user.unsubscribe_token}`;
      const html = wrapEmailLayout(
        renderEmailTemplateVariables(bodyHtml, { email: user.email }),
        preheader,
        unsubUrl,
      );

      try {
        await resend.emails.send({
          from: BRAND.from,
          to: user.email,
          subject,
          html,
          headers: {
            "List-Unsubscribe": `<mailto:unsubscribe@autolister.app?subject=Unsubscribe>, <${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        results.push({
          email: user.email,
          status: "sent",
          subscribed: user.email_subscribed,
        });
      } catch (err: any) {
        console.error(`Failed to send to ${user.email}:`, err.message);
        results.push({
          email: user.email,
          status: "failed",
          error: err.message,
          subscribed: user.email_subscribed,
        });
      }

      // Pace at ~10/sec to stay well within Resend limits
      await new Promise((r) => setTimeout(r, 100));
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const mode = recipient_emails ? "specific" : "bulk";

    return res.status(200).json({
      mode,
      total: users.length,
      sent,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("Campaign error:", error);
    return res.status(500).json({ error: error.message });
  }
}

const LIMIT_FOLLOWUP_SEND_DELAY_MS = 1000;

async function handleSendLimitFollowup(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    const {
      dry_run = true,
      since_hours = 168,
      min_delay_minutes = 30,
      excluded_emails = [],
      test_email,
    } = req.body || {};

    const sinceHours = Math.max(
      1,
      Math.min(Number(since_hours) || 168, 24 * 30),
    );
    const minDelayMinutes = Math.max(
      0,
      Math.min(Number(min_delay_minutes) || 30, 24 * 60),
    );
    const template = TEMPLATES.limit_hit_followup_v1;
    if (!template) {
      return res
        .status(500)
        .json({ error: "Missing limit follow-up template." });
    }

    if (test_email) {
      const demoUnsubUrl =
        "https://autolister.app/api/unsubscribe?token=00000000-0000-0000-0000-000000000000";
      const html = wrapEmailLayout(
        renderEmailTemplateVariables(template.body, {
          email: test_email,
          allowUnsignedFallback: isLocalRequest(req),
        }),
        template.preheader,
        demoUnsubUrl,
      );

      await resend.emails.send({
        from: BRAND.from,
        to: test_email,
        subject: `[TEST] ${template.subject}`,
        html,
        headers: {
          "List-Unsubscribe": `<mailto:unsubscribe@autolister.app?subject=Unsubscribe>, <${demoUnsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      return res.status(200).json({
        mode: "test",
        sent_to: test_email,
        subject: `[TEST] ${template.subject}`,
      });
    }

    const exclusions = await getAllLimitFollowupExclusions(excluded_emails);
    const recipients = await findLimitFollowupRecipients({
      sinceHours,
      minDelayMinutes,
      excludedEmails: exclusions.excludedEmails,
      excludedUserIds: exclusions.excludedUserIds,
    });
    const excludedEmails = Array.from(exclusions.excludedEmails);

    if (dry_run !== false) {
      return res.status(200).json({
        mode: "dry_run",
        template_key: "limit_hit_followup_v1",
        coupon_code: LIMIT_FOLLOWUP_COUPON_CODE,
        since_hours: sinceHours,
        min_delay_minutes: minDelayMinutes,
        excluded_emails: excludedEmails,
        total: recipients.length,
        recipients: recipients.map((recipient) => ({
          email: recipient.email,
          limitHitAt: recipient.limitHitAt,
        })),
      });
    }

    const results: Array<{ email: string; status: string; error?: string }> =
      [];

    for (const recipient of recipients) {
      const unsubUrl = `https://autolister.app/api/unsubscribe?token=${recipient.unsubscribe_token}`;
      const html = wrapEmailLayout(
        renderEmailTemplateVariables(template.body, {
          email: recipient.email,
          allowUnsignedFallback: isLocalRequest(req),
        }),
        template.preheader,
        unsubUrl,
      );

      try {
        await resend.emails.send({
          from: BRAND.from,
          to: recipient.email,
          subject: template.subject,
          html,
          headers: {
            "List-Unsubscribe": `<mailto:unsubscribe@autolister.app?subject=Unsubscribe>, <${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        results.push({ email: recipient.email, status: "sent" });
        await ApiLogger.logRequest({
          userId: recipient.id,
          userEmail: recipient.email,
          endpoint: "/event/limit_followup_email_sent",
          requestMethod: "POST",
          responseStatus: 204,
          fullRequestBody: {
            event: "limit_followup_email_sent",
            source: "admin",
            page: "admin",
            context: {
              template: "limit_hit_followup_v1",
              couponCode: LIMIT_FOLLOWUP_COUPON_CODE,
              limitHitAt: recipient.limitHitAt,
            },
          },
        });
      } catch (err: any) {
        console.error(
          `Failed to send limit follow-up to ${recipient.email}:`,
          err.message,
        );
        results.push({
          email: recipient.email,
          status: "failed",
          error: err.message,
        });
      }

      await new Promise((r) => setTimeout(r, LIMIT_FOLLOWUP_SEND_DELAY_MS));
    }

    const sent = results.filter((result) => result.status === "sent").length;
    const failed = results.filter(
      (result) => result.status === "failed",
    ).length;

    return res.status(200).json({
      mode: "send",
      template_key: "limit_hit_followup_v1",
      coupon_code: LIMIT_FOLLOWUP_COUPON_CODE,
      excluded_emails: excludedEmails,
      total: recipients.length,
      sent,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("Limit follow-up campaign error:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleExcludeLimitFollowup(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    const email = normalizeEmailForCampaign(req.body?.email);
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    await ApiLogger.logRequest({
      userId: (profile?.id as string | undefined) || undefined,
      userEmail: (profile?.email as string | undefined) || email,
      endpoint: LIMIT_FOLLOWUP_EXCLUSION_EVENT,
      requestMethod: "POST",
      responseStatus: 204,
      fullRequestBody: {
        event: "limit_followup_email_excluded",
        source: "admin",
        page: "admin",
        context: {
          email,
        },
      },
    });

    return res.status(200).json({
      ok: true,
      email,
      user_id: profile?.id || null,
    });
  } catch (error: any) {
    console.error("Limit follow-up exclusion error:", error);
    return res.status(500).json({ error: error.message });
  }
}

function renderEmailTemplateVariables(
  html: string,
  options: { email: string; allowUnsignedFallback?: boolean },
) {
  const hasCharlotteOffer = html.includes("{{PRICING_OFFER_URL}}");
  const hasLimitFollowupOffer = html.includes("{{LIMIT_FOLLOWUP_PRICING_URL}}");
  if (!hasCharlotteOffer && !hasLimitFollowupOffer) return html;

  let charlottePricingOfferUrl: string | null = null;
  let limitFollowupPricingOfferUrl: string | null = null;
  try {
    if (hasCharlotteOffer) {
      charlottePricingOfferUrl = createPricingOfferUrl(
        {
          email: options.email,
          targetTier: "pro",
          couponCode: "L1ST3R50",
          expiresAt: "2026-07-05T21:59:00.000Z",
        },
        undefined,
        { utmCampaign: "charlotte_pro_offer" },
      );
    }
    if (hasLimitFollowupOffer) {
      limitFollowupPricingOfferUrl = createPricingOfferUrl(
        {
          email: options.email,
          targetTier: "pro",
          couponCode: LIMIT_FOLLOWUP_COUPON_CODE,
          expiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        undefined,
        { utmCampaign: "limit_followup_offer" },
      );
    }
  } catch (error) {
    if (!options.allowUnsignedFallback) throw error;
    charlottePricingOfferUrl =
      "https://autolister.app/pricing?offer=SIGNED_OFFER_TOKEN";
    limitFollowupPricingOfferUrl =
      "https://autolister.app/pricing?offer=SIGNED_LIMIT_FOLLOWUP_TOKEN";
  }

  return html
    .split("{{PRICING_OFFER_URL}}")
    .join(charlottePricingOfferUrl || "")
    .split("{{LIMIT_FOLLOWUP_PRICING_URL}}")
    .join(limitFollowupPricingOfferUrl || "");
}
