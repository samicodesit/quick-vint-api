import { isAccountPaused } from "../src/utils/accountPause";
import { isGenerationSuspendedForPayment } from "../src/utils/subscriptionStatus";
import {
  CREDIT_PACK_CONFIG,
  TIER_CONFIGS,
  getAllPaidTiers,
  getEffectiveTier,
  getTierConfigForProfile,
} from "./tierConfig";
import {
  RateLimiter,
  type GenerationCapacity,
  type UserProfile,
} from "./rateLimiter";
import { supabase } from "./supabaseClient";

export interface UsageProfile extends UserProfile {
  id?: string | null;
  current_period_end: string | null;
  account_status: string | null;
  abuse_reason: string | null;
}

export type UsagePlanStatus =
  | "free"
  | "active"
  | "paused"
  | "inactive"
  | "payment_required";

export interface UsageResponse {
  plan: {
    tier: string;
    status: UsagePlanStatus;
    isPaid: boolean;
  };
  limits: {
    freeLifetime: number | null;
    daily: number | null;
    monthly: number | null;
    burstPerMinute: number | null;
    packCredits: number;
  };
  remaining: {
    freeLifetime: number | null;
    daily: number | null;
    monthly: number | null;
    minute: number | null;
    packCredits: number;
  };
  resetsAt: {
    minute: string | null;
    daily: string | null;
    monthly: string | null;
    subscriptionPeriodEnd: string | null;
  };
  canGenerate: boolean;
  pricing: {
    currency: "EUR";
    tiers: Record<string, { monthly: number }>;
    creditPack: { credits: number; price: number };
  };
}

export class UsageRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = "UsageRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const PROFILE_SELECT =
  "id, api_calls_this_month, subscription_status, subscription_tier, current_period_end, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, account_status, abuse_reason";

function nonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }

  return null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function normalizeProfile(data: Record<string, unknown>): UsageProfile {
  return {
    id: nullableString(data.id),
    api_calls_this_month: nonNegativeNumber(data.api_calls_this_month) ?? 0,
    subscription_status:
      typeof data.subscription_status === "string" && data.subscription_status
        ? data.subscription_status
        : "free",
    subscription_tier:
      typeof data.subscription_tier === "string" && data.subscription_tier
        ? data.subscription_tier
        : "free",
    current_period_end: nullableString(data.current_period_end),
    is_legacy_plan:
      typeof data.is_legacy_plan === "boolean" ? data.is_legacy_plan : false,
    free_lifetime_generations_used: nonNegativeNumber(
      data.free_lifetime_generations_used,
    ),
    pack_credits: nonNegativeNumber(data.pack_credits),
    custom_daily_limit: nonNegativeNumber(data.custom_daily_limit),
    custom_monthly_limit: nonNegativeNumber(data.custom_monthly_limit),
    custom_limit_expires_at: nullableString(data.custom_limit_expires_at),
    account_status: nullableString(data.account_status),
    abuse_reason: nullableString(data.abuse_reason),
  };
}

function pricingSummary() {
  return {
    currency: "EUR" as const,
    tiers: Object.fromEntries(
      getAllPaidTiers().map((tier) => [
        tier.id,
        { monthly: tier.monthlyPrice },
      ]),
    ),
    creditPack: {
      credits: CREDIT_PACK_CONFIG.credits,
      price: CREDIT_PACK_CONFIG.priceEur,
    },
  };
}

export function getUtcResetBoundary(
  now: Date,
  unit: "minute" | "day" | "month",
): string {
  const boundary = new Date(now.getTime());

  if (unit === "minute") {
    boundary.setUTCSeconds(0, 0);
    boundary.setUTCMinutes(boundary.getUTCMinutes() + 1);
  } else if (unit === "day") {
    boundary.setUTCHours(0, 0, 0, 0);
    boundary.setUTCDate(boundary.getUTCDate() + 1);
  } else {
    boundary.setUTCHours(0, 0, 0, 0);
    boundary.setUTCMonth(boundary.getUTCMonth() + 1, 1);
  }

  return boundary.toISOString();
}

function getPlanStatus(
  profile: UsageProfile,
  capacity: GenerationCapacity,
  tier: string,
): UsagePlanStatus {
  if (isAccountPaused(profile)) return "paused";
  if (profile.account_status !== "active") {
    return "inactive";
  }
  if (
    capacity.reason === "payment_required" ||
    isGenerationSuspendedForPayment(profile.subscription_status)
  ) {
    return "payment_required";
  }

  return tier === "free" ? "free" : "active";
}

export function buildUsageResponse(
  profile: UsageProfile,
  capacity: GenerationCapacity,
  minuteRemaining: number | null,
  now: Date = new Date(),
): UsageResponse {
  const tier = getEffectiveTier(profile);
  const tierConfig = getTierConfigForProfile(profile);
  const status = getPlanStatus(profile, capacity, tier);
  const isPaid = tier !== "free";
  const freeLifetimeApplicable = tier === "free";
  const freeLifetimeLimit = freeLifetimeApplicable
    ? nonNegativeNumber(capacity.limits.freeLifetime)
    : null;
  const dailyLimit =
    tier === "free" ? null : nonNegativeNumber(capacity.limits.daily);
  const monthlyLimit =
    tier === "free" ? null : nonNegativeNumber(capacity.limits.monthly);
  const burstPerMinute =
    nonNegativeNumber(capacity.limits.burstPerMinute) ??
    TIER_CONFIGS[tier].limits.burst.perMinute ??
    tierConfig.limits.burst.perMinute;
  const packCredits =
    nonNegativeNumber(capacity.remaining.packCredits) ??
    nonNegativeNumber(profile.pack_credits) ??
    0;
  const remainingFreeLifetime = freeLifetimeApplicable
    ? nonNegativeNumber(capacity.remaining.freeLifetime)
    : null;
  const remainingDaily =
    dailyLimit === null ? null : nonNegativeNumber(capacity.remaining.day);
  const remainingMonthly =
    monthlyLimit === null ? null : nonNegativeNumber(capacity.remaining.month);
  const remainingMinute = nonNegativeNumber(minuteRemaining);
  const hasRecurringFreeLimits = tier === "free" && freeLifetimeLimit === null;
  const dailyResetApplicable =
    dailyLimit !== null && (tier !== "free" || hasRecurringFreeLimits);
  const monthlyResetApplicable =
    monthlyLimit !== null && (tier !== "free" || hasRecurringFreeLimits);

  return {
    plan: {
      tier,
      status,
      isPaid,
    },
    limits: {
      freeLifetime: freeLifetimeLimit,
      daily: dailyLimit,
      monthly: monthlyLimit,
      burstPerMinute,
      packCredits,
    },
    remaining: {
      freeLifetime: remainingFreeLifetime,
      daily: remainingDaily,
      monthly: remainingMonthly,
      minute: remainingMinute,
      packCredits,
    },
    resetsAt: {
      minute:
        burstPerMinute === null ? null : getUtcResetBoundary(now, "minute"),
      daily: dailyResetApplicable ? getUtcResetBoundary(now, "day") : null,
      monthly: monthlyResetApplicable
        ? getUtcResetBoundary(now, "month")
        : null,
      subscriptionPeriodEnd: nullableString(profile.current_period_end),
    },
    canGenerate:
      status !== "paused" &&
      status !== "inactive" &&
      status !== "payment_required" &&
      Boolean(capacity.allowed),
    pricing: pricingSummary(),
  };
}

export async function getUsageForBearer(token: string): Promise<UsageResponse> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user?.id) {
    throw new UsageRequestError(
      401,
      "Invalid or expired token",
      "unauthorized",
    );
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    throw new UsageRequestError(
      500,
      "Could not retrieve usage.",
      "profile_read_failed",
    );
  }

  if (!data || !data.id) {
    throw new UsageRequestError(
      404,
      "Usage account was not found.",
      "profile_not_found",
    );
  }

  const profile = normalizeProfile(data as Record<string, unknown>);
  const capacity = await RateLimiter.getGenerationCapacity(
    profile.id as string,
    profile,
  );
  const minuteValue = capacity.remaining.minute;
  let minuteRemaining: number | null;

  if (minuteValue !== undefined) {
    minuteRemaining = minuteValue ?? null;
  } else {
    try {
      minuteRemaining = await RateLimiter.getGenerationMinuteRemaining(
        profile.id as string,
        capacity.limits.burstPerMinute,
      );
    } catch {
      minuteRemaining = null;
    }
  }

  return buildUsageResponse(profile, capacity, minuteRemaining, new Date());
}
