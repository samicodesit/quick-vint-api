// utils/rateLimiter.ts
import { supabase } from "./supabaseClient";
import {
  FREE_LIFETIME_LIMIT,
  TIER_CONFIGS,
  getEffectiveTier,
  getNextTier,
  getPricingLimitsMode,
  getTierConfigForProfile,
  hasUnlimitedDailyLimit,
  type PricingLimitsMode,
} from "./tierConfig";

// Global cost protection
const GLOBAL_DAILY_BUDGET_USD = 100; // Increased for business growth
// Budget guardrail only. Admin cost reporting uses token-level api_logs pricing.
const OPENAI_COST_PER_REQUEST_USD = 0.0201; // Based on actual dashboard: $6.12/304 requests

interface RateLimitResult {
  allowed: boolean;
  error?: string;
  code?:
    | "daily_limit"
    | "monthly_limit"
    | "free_lifetime_limit"
    | "emoji_retry_used"
    | "burst_limit"
    | "service_unavailable";
  currentTier?: string;
  nextTier?: string | null;
  limitScope?: "day" | "month" | "minute" | "service";
  currentLimit?: number | null;
  remainingRequests?: {
    minute: number;
    day?: number | null;
    month: number;
    freeLifetime?: number | null;
    packCredits?: number | null;
  };
  reservationId?: string | null;
}

type ReservationRpcResult = {
  allowed?: boolean;
  error?: string;
  code?: RateLimitResult["code"];
  currentTier?: string;
  nextTier?: string | null;
  limitScope?: RateLimitResult["limitScope"];
  currentLimit?: number | null;
  remainingRequests?: RateLimitResult["remainingRequests"];
  reservationId?: string | null;
};

export interface UserProfile {
  subscription_status: string;
  subscription_tier: string;
  api_calls_this_month: number;
  is_legacy_plan?: boolean | null;
  free_lifetime_generations_used?: number | null;
  pack_credits?: number | null;
  custom_daily_limit?: number | null;
  custom_monthly_limit?: number | null;
  custom_limit_expires_at?: string | null;
}

export interface GenerationCapacity {
  allowed: boolean;
  available: number;
  tier: string;
  nextTier?: string | null;
  reason?: RateLimitResult["code"];
  message?: string;
  limits: {
    daily: number | null;
    monthly: number;
    freeLifetime?: number | null;
    burstPerMinute: number;
  };
  remaining: {
    minute?: number;
    day: number | null;
    month: number;
    freeLifetime?: number | null;
    packCredits: number;
  };
}

function hasActiveCustomLimits(profile: UserProfile): boolean {
  return Boolean(
    profile.custom_limit_expires_at &&
    new Date(profile.custom_limit_expires_at) > new Date(),
  );
}

function getActiveCustomDailyLimit(profile: UserProfile): number | null {
  if (
    hasActiveCustomLimits(profile) &&
    typeof profile.custom_daily_limit === "number" &&
    profile.custom_daily_limit > 0
  ) {
    return profile.custom_daily_limit;
  }

  return null;
}

function getEffectiveMonthlyLimit(
  profile: UserProfile,
  defaultLimit: number,
): number {
  if (
    hasActiveCustomLimits(profile) &&
    typeof profile.custom_monthly_limit === "number" &&
    profile.custom_monthly_limit > 0
  ) {
    return profile.custom_monthly_limit;
  }

  return defaultLimit;
}

export class RateLimiter {
  private static async getTimeBasedKey(
    userId: string,
    window: string,
  ): Promise<string> {
    const now = new Date();
    let timeKey: string;

    // Use UTC components so keys and expiries align with UTC-based daily stats
    switch (window) {
      case "minute":
        timeKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
        break;
      case "day":
        timeKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
        break;
      default:
        throw new Error(`Invalid time window: ${window}`);
    }

    return `rate_limit:${userId}:${window}:${timeKey}`;
  }

  private static async getCurrentCount(
    userId: string,
    window: string,
  ): Promise<number> {
    try {
      const key = await this.getTimeBasedKey(userId, window);

      // For this implementation, we'll store rate limit data in the database
      // In production, you'd want to use Redis for better performance
      const { data, error } = await supabase
        .from("rate_limits")
        .select("count")
        .eq("key", key)
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching rate limit:", error);
        return 0;
      }

      return data?.count || 0;
    } catch (err) {
      console.error("Error in getCurrentCount:", err);
      return 0;
    }
  }

  private static async incrementCount(
    userId: string,
    window: string,
  ): Promise<void> {
    try {
      const key = await this.getTimeBasedKey(userId, window);
      const now = new Date().toISOString();

      // Calculate expiry time based on window and align to natural boundaries
      // Use UTC-aligned expiries so resets line up predictably
      let expiryDate = new Date();
      if (window === "minute") {
        // expire at the start of the next UTC minute
        expiryDate = new Date(
          Date.UTC(
            expiryDate.getUTCFullYear(),
            expiryDate.getUTCMonth(),
            expiryDate.getUTCDate(),
            expiryDate.getUTCHours(),
            expiryDate.getUTCMinutes() + 1,
            0,
            0,
          ),
        );
      } else if (window === "day") {
        // expire at the start of the next UTC day (00:00 UTC)
        expiryDate = new Date(
          Date.UTC(
            expiryDate.getUTCFullYear(),
            expiryDate.getUTCMonth(),
            expiryDate.getUTCDate() + 1,
            0,
            0,
            0,
            0,
          ),
        );
      } else {
        // fallback short UTC buffer for unknown windows
        expiryDate = new Date(Date.now() + 5 * 60 * 1000);
      }

      // Upsert the count
      const { data: existing } = await supabase
        .from("rate_limits")
        .select("count, expires_at")
        .eq("key", key)
        .eq("user_id", userId)
        .single();

      if (existing) {
        await supabase
          .from("rate_limits")
          .update({
            count: existing.count + 1,
            updated_at: now,
            // If the existing row has no expiry, set one now (avoid permanent null expiry rows)
            expires_at: existing.expires_at || expiryDate.toISOString(),
          })
          .eq("key", key)
          .eq("user_id", userId);
      } else {
        await supabase.from("rate_limits").insert({
          key,
          user_id: userId,
          count: 1,
          window_type: window,
          expires_at: expiryDate.toISOString(),
          created_at: now,
          updated_at: now,
        });
      }
    } catch (err) {
      console.error("Error incrementing rate limit count:", err);
      // Don't throw here to avoid blocking API calls due to rate limit tracking issues
    }
  }

  private static async checkGlobalBudget(): Promise<boolean> {
    try {
      const today = new Date();
      // Use ISO YYYY-MM-DD to match other parts of the codebase
      const todayStr = today.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("daily_stats")
        .select("total_api_calls, estimated_cost")
        .eq("date", todayStr)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error checking global budget:", error);
        return true; // Allow on error to avoid blocking service
      }

      const currentCost = data?.estimated_cost || 0;
      return currentCost < GLOBAL_DAILY_BUDGET_USD;
    } catch (err) {
      console.error("Error in checkGlobalBudget:", err);
      return true; // Allow on error
    }
  }

  private static async updateGlobalStats(): Promise<void> {
    try {
      const today = new Date();
      // Use ISO YYYY-MM-DD to match other parts of the codebase
      const todayStr = today.toISOString().split("T")[0];
      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from("daily_stats")
        .select("total_api_calls, estimated_cost")
        .eq("date", todayStr)
        .single();

      if (existing) {
        await supabase
          .from("daily_stats")
          .update({
            total_api_calls: existing.total_api_calls + 1,
            estimated_cost:
              existing.estimated_cost + OPENAI_COST_PER_REQUEST_USD,
            updated_at: now,
          })
          .eq("date", todayStr);
      } else {
        await supabase.from("daily_stats").insert({
          date: todayStr,
          total_api_calls: 1,
          estimated_cost: OPENAI_COST_PER_REQUEST_USD,
          created_at: now,
          updated_at: now,
        });
      }
    } catch (err) {
      console.error("Error updating global stats:", err);
    }
  }

  static async checkRateLimit(
    userId: string,
    profile: UserProfile,
    pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
  ): Promise<RateLimitResult> {
    try {
      // 0. Check emergency brake first
      const { data: emergencyBrake } = await supabase
        .from("system_settings")
        .select("value, reason")
        .eq("key", "emergency_brake")
        .single();

      if (emergencyBrake?.value === "true") {
        return {
          allowed: false,
          code: "service_unavailable",
          limitScope: "service",
          error: "Service temporarily unavailable. Please try again later.",
        };
      }

      // 1. Check global budget
      const globalBudgetOk = await this.checkGlobalBudget();
      if (!globalBudgetOk) {
        return {
          allowed: false,
          code: "service_unavailable",
          limitScope: "service",
          error:
            "Service temporarily unavailable due to daily budget limits. Please try again later.",
        };
      }

      // 2. Check for custom user limits first
      const { data: customLimits } = await supabase
        .from("profiles")
        .select(
          "custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, custom_limit_reason",
        )
        .eq("id", userId)
        .single();

      const tierKey = getEffectiveTier(profile);
      const tierConfig = getTierConfigForProfile(profile, pricingLimitsMode);
      const profileWithCustomLimits = {
        ...profile,
        custom_daily_limit: customLimits?.custom_daily_limit ?? null,
        custom_monthly_limit: customLimits?.custom_monthly_limit ?? null,
        custom_limit_expires_at: customLimits?.custom_limit_expires_at ?? null,
      };
      const effectiveMonthlyLimit = getEffectiveMonthlyLimit(
        profileWithCustomLimits,
        tierConfig.limits.monthly,
      );
      const nextTier = getNextTier(tierKey);

      // Free users use a lifetime trial plus optional pack credits, not
      // recurring daily/monthly allowances.
      if (pricingLimitsMode === "current" && tierKey === "free") {
        const minuteCount = await this.getCurrentCount(userId, "minute");
        if (minuteCount >= TIER_CONFIGS.free.limits.burst.perMinute) {
          return {
            allowed: false,
            code: "burst_limit",
            currentTier: tierKey,
            nextTier,
            limitScope: "minute",
            currentLimit: TIER_CONFIGS.free.limits.burst.perMinute,
            error:
              "Too many requests. Please wait a moment before trying again.",
          };
        }

        const freeUsed = Math.max(
          0,
          profile.free_lifetime_generations_used || 0,
        );
        const packCredits = Math.max(0, profile.pack_credits || 0);
        const freeRemaining = Math.max(FREE_LIFETIME_LIMIT - freeUsed, 0);

        if (freeRemaining > 0 || packCredits > 0) {
          return {
            allowed: true,
            remainingRequests: {
              minute: Math.max(
                0,
                TIER_CONFIGS.free.limits.burst.perMinute - minuteCount - 1,
              ),
              day: null,
              month: 0,
              freeLifetime: Math.max(freeRemaining - 1, 0),
              packCredits,
            },
          };
        }

        return {
          allowed: false,
          code: "free_lifetime_limit",
          currentTier: "free",
          nextTier,
          limitScope: "month",
          currentLimit: FREE_LIFETIME_LIMIT,
          error:
            "Free listing limit reached. Upgrade your plan or buy a one-time credit pack.",
        };
      }

      const packCredits = Math.max(0, profile.pack_credits || 0);

      // 3. Check monthly limit. Pack credits can top up any tier.
      if (profile.api_calls_this_month >= effectiveMonthlyLimit) {
        if (packCredits > 0) {
          return {
            allowed: true,
            remainingRequests: {
              minute: 0,
              day: null,
              month: 0,
              packCredits,
            },
          };
        }

        return {
          allowed: false,
          code: "monthly_limit",
          currentTier: tierKey,
          nextTier,
          limitScope: "month",
          currentLimit: effectiveMonthlyLimit,
          error:
            "Monthly usage limit reached. Please upgrade your plan or try again next month.",
        };
      }

      // 4. Check time-based limits
      const minuteCount = await this.getCurrentCount(userId, "minute");
      const dayCount = await this.getCurrentCount(userId, "day");

      if (minuteCount >= tierConfig.limits.burst.perMinute) {
        return {
          allowed: false,
          code: "burst_limit",
          currentTier: tierKey,
          nextTier,
          limitScope: "minute",
          currentLimit: tierConfig.limits.burst.perMinute,
          error: "Too many requests. Please wait a moment before trying again.",
        };
      }
      // 5. Check daily limits. In compatibility mode, Business keeps the old
      // no-daily-cap behavior until the extension rollout is complete.
      const activeCustomDailyLimit = getActiveCustomDailyLimit(
        profileWithCustomLimits,
      );
      const effectiveDailyLimit =
        activeCustomDailyLimit ??
        (hasUnlimitedDailyLimit(profile, pricingLimitsMode)
          ? null
          : tierConfig.limits.daily);

      if (effectiveDailyLimit !== null && dayCount >= effectiveDailyLimit) {
        if (packCredits > 0) {
          return {
            allowed: true,
            remainingRequests: {
              minute: Math.max(
                0,
                tierConfig.limits.burst.perMinute - minuteCount - 1,
              ),
              day: 0,
              month: Math.max(
                0,
                effectiveMonthlyLimit - profile.api_calls_this_month - 1,
              ),
              packCredits,
            },
          };
        }

        return {
          allowed: false,
          code: "daily_limit",
          currentTier: tierKey,
          nextTier,
          limitScope: "day",
          currentLimit: effectiveDailyLimit,
          error:
            "Daily usage limit reached. Please try again tomorrow or upgrade your plan.",
        };
      }

      // 6. All checks passed - return success but don't increment yet
      // Counters will be incremented only after successful API generation
      return {
        allowed: true,
        remainingRequests: {
          minute: Math.max(
            0,
            tierConfig.limits.burst.perMinute - minuteCount - 1,
          ),
          day:
            effectiveDailyLimit !== null
              ? Math.max(0, (effectiveDailyLimit || 0) - dayCount - 1)
              : null,
          month: Math.max(
            0,
            effectiveMonthlyLimit - profile.api_calls_this_month - 1,
          ),
        },
      };
    } catch (err) {
      console.error("Rate limiter error:", err);
      // On error, allow the request but log the issue
      return { allowed: true };
    }
  }

  static async reserveGenerationRequest(
    userId: string,
    profile: UserProfile,
    pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
  ): Promise<RateLimitResult> {
    const tierKey = getEffectiveTier(profile);
    const tierConfig = getTierConfigForProfile(profile, pricingLimitsMode);
    const monthlyLimit = getEffectiveMonthlyLimit(
      profile,
      tierConfig.limits.monthly,
    );
    const activeCustomDailyLimit = getActiveCustomDailyLimit(profile);
    const hasUnlimitedDaily =
      activeCustomDailyLimit === null &&
      hasUnlimitedDailyLimit(profile, pricingLimitsMode);
    const freeRemaining =
      pricingLimitsMode === "current" && tierKey === "free"
        ? Math.max(
            FREE_LIFETIME_LIMIT -
              Math.max(0, profile.free_lifetime_generations_used || 0),
            0,
          )
        : 0;
    const paidCreditBurstLimit =
      pricingLimitsMode === "current" && tierKey === "free"
        ? Math.max(0, freeRemaining + Math.max(0, profile.pack_credits || 0))
        : 0;
    const burstLimit = Math.max(
      tierConfig.limits.burst.perMinute,
      paidCreditBurstLimit,
    );
    const dailyLimit =
      activeCustomDailyLimit ??
      (hasUnlimitedDaily ? null : tierConfig.limits.daily);

    try {
      const { data, error } = await supabase.rpc("reserve_generation_request", {
        p_user_id: userId,
        p_pricing_limits_mode: pricingLimitsMode,
        p_effective_tier: tierKey,
        p_monthly_limit: monthlyLimit,
        p_daily_limit: dailyLimit,
        p_burst_limit: burstLimit,
        p_free_lifetime_limit: FREE_LIFETIME_LIMIT,
        p_has_unlimited_daily: hasUnlimitedDaily,
      });

      if (error) {
        console.error("Generation reservation failed:", error);
        return {
          allowed: false,
          code: "service_unavailable",
          limitScope: "service",
          error: "Could not reserve generation capacity. Please try again.",
        };
      }

      const result = data as ReservationRpcResult | null;
      if (!result?.allowed) {
        return {
          allowed: false,
          code: result?.code,
          currentTier: result?.currentTier || tierKey,
          nextTier: result?.nextTier ?? getNextTier(tierKey),
          limitScope: result?.limitScope,
          currentLimit: result?.currentLimit ?? undefined,
          remainingRequests: result?.remainingRequests,
          error: result?.error || "Too many requests. Please try again later.",
        };
      }

      return {
        allowed: true,
        remainingRequests: result.remainingRequests,
        reservationId: result.reservationId ?? null,
      };
    } catch (err) {
      console.error("Generation reservation exception:", err);
      return {
        allowed: false,
        code: "service_unavailable",
        limitScope: "service",
        error: "Could not reserve generation capacity. Please try again.",
      };
    }
  }

  static async reserveEmojiRetry(
    userId: string,
    profile: UserProfile,
    pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
  ): Promise<RateLimitResult> {
    const tierKey = getEffectiveTier(profile);

    if (pricingLimitsMode !== "current" || tierKey !== "free") {
      return {
        allowed: false,
        code: "emoji_retry_used",
        currentTier: tierKey,
        nextTier: getNextTier(tierKey),
        limitScope: "month",
        error:
          "The free no-emoji retry is only available during the free trial.",
      };
    }

    try {
      const { data: emergencyBrake } = await supabase
        .from("system_settings")
        .select("value, reason")
        .eq("key", "emergency_brake")
        .single();

      if (emergencyBrake?.value === "true") {
        return {
          allowed: false,
          code: "service_unavailable",
          limitScope: "service",
          error: "Service temporarily unavailable. Please try again later.",
        };
      }

      const globalBudgetOk = await this.checkGlobalBudget();
      if (!globalBudgetOk) {
        return {
          allowed: false,
          code: "service_unavailable",
          limitScope: "service",
          error:
            "Service temporarily unavailable due to daily budget limits. Please try again later.",
        };
      }

      const { data: existingRetry, error: existingError } = await supabase
        .from("generation_reservations")
        .select("id")
        .eq("user_id", userId)
        .contains("metadata", { emoji_retry: true })
        .limit(1)
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") {
        console.error("Emoji retry lookup failed:", existingError);
        return {
          allowed: false,
          code: "service_unavailable",
          limitScope: "service",
          error: "Could not reserve the no-emoji retry. Please try again.",
        };
      }

      if (existingRetry) {
        return {
          allowed: false,
          code: "emoji_retry_used",
          currentTier: tierKey,
          nextTier: getNextTier(tierKey),
          limitScope: "month",
          error: "The free no-emoji retry was already used for this account.",
        };
      }

      const { data: reservation, error: insertError } = await supabase
        .from("generation_reservations")
        .insert({
          user_id: userId,
          status: "pending",
          entitlement_type: "free_lifetime",
          counted_month: false,
          counted_day: false,
          metadata: {
            source: "api_generate",
            reservation: true,
            emoji_retry: true,
            pricing_limits_mode: pricingLimitsMode,
          },
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Emoji retry reservation failed:", insertError);
        return {
          allowed: false,
          code: "emoji_retry_used",
          currentTier: tierKey,
          nextTier: getNextTier(tierKey),
          limitScope: "month",
          error: "The free no-emoji retry was already used for this account.",
        };
      }

      await this.updateGlobalStats();

      return {
        allowed: true,
        remainingRequests: {
          minute: 0,
          day: null,
          month: 0,
          freeLifetime: Math.max(
            0,
            FREE_LIFETIME_LIMIT -
              Math.max(0, profile.free_lifetime_generations_used || 0),
          ),
          packCredits: Math.max(0, profile.pack_credits || 0),
        },
        reservationId: reservation?.id ?? null,
      };
    } catch (err) {
      console.error("Emoji retry reservation exception:", err);
      return {
        allowed: false,
        code: "service_unavailable",
        limitScope: "service",
        error: "Could not reserve the no-emoji retry. Please try again.",
      };
    }
  }

  static async commitGenerationReservation(
    reservationId?: string | null,
  ): Promise<void> {
    if (!reservationId) return;

    try {
      const { error } = await supabase.rpc("commit_generation_reservation", {
        p_reservation_id: reservationId,
      });

      if (error) {
        console.error("Generation reservation commit failed:", error);
      }
    } catch (err) {
      console.error("Generation reservation commit exception:", err);
    }
  }

  static async refundGenerationReservation(
    reservationId?: string | null,
    reason = "generation_failed",
  ): Promise<void> {
    if (!reservationId) return;

    try {
      const { error } = await supabase.rpc("refund_generation_reservation", {
        p_reservation_id: reservationId,
        p_reason: reason,
      });

      if (error) {
        console.error("Generation reservation refund failed:", error);
      }
    } catch (err) {
      console.error("Generation reservation refund exception:", err);
    }
  }

  static async getGenerationCapacity(
    userId: string,
    profile: UserProfile,
    pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
  ): Promise<GenerationCapacity> {
    const tierKey = getEffectiveTier(profile);
    const tierConfig = getTierConfigForProfile(profile, pricingLimitsMode);
    const nextTier = getNextTier(tierKey);
    const packCredits = Math.max(0, profile.pack_credits || 0);

    const baseCapacity = {
      tier: tierKey,
      nextTier,
      limits: {
        daily: tierConfig.limits.daily,
        monthly: tierConfig.limits.monthly,
        burstPerMinute: tierConfig.limits.burst.perMinute,
      },
    };

    try {
      const { data: emergencyBrake } = await supabase
        .from("system_settings")
        .select("value, reason")
        .eq("key", "emergency_brake")
        .single();

      if (emergencyBrake?.value === "true") {
        return {
          ...baseCapacity,
          allowed: false,
          available: 0,
          reason: "service_unavailable",
          message: "Service temporarily unavailable. Please try again later.",
          remaining: { day: null, month: 0, packCredits },
        };
      }

      const globalBudgetOk = await this.checkGlobalBudget();
      if (!globalBudgetOk) {
        return {
          ...baseCapacity,
          allowed: false,
          available: 0,
          reason: "service_unavailable",
          message:
            "Service temporarily unavailable due to daily budget limits. Please try again later.",
          remaining: { day: null, month: 0, packCredits },
        };
      }

      const { data: customLimits } = await supabase
        .from("profiles")
        .select(
          "custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, custom_limit_reason",
        )
        .eq("id", userId)
        .single();
      const profileWithCustomLimits = {
        ...profile,
        custom_daily_limit: customLimits?.custom_daily_limit ?? null,
        custom_monthly_limit: customLimits?.custom_monthly_limit ?? null,
        custom_limit_expires_at: customLimits?.custom_limit_expires_at ?? null,
      };

      if (pricingLimitsMode === "current" && tierKey === "free") {
        const freeUsed = Math.max(
          0,
          profile.free_lifetime_generations_used || 0,
        );
        const freeRemaining = Math.max(FREE_LIFETIME_LIMIT - freeUsed, 0);
        const available = freeRemaining + packCredits;

        return {
          ...baseCapacity,
          allowed: available > 0,
          available,
          reason: available > 0 ? undefined : "free_lifetime_limit",
          message:
            available > 0
              ? undefined
              : "Free listing limit reached. Upgrade your plan or buy a one-time credit pack.",
          limits: {
            ...baseCapacity.limits,
            daily: null,
            freeLifetime: FREE_LIFETIME_LIMIT,
          },
          remaining: {
            day: null,
            month: 0,
            freeLifetime: freeRemaining,
            packCredits,
          },
        };
      }

      const minuteCount = await this.getCurrentCount(userId, "minute");
      const dayCount = await this.getCurrentCount(userId, "day");
      const monthlyUsed = Math.max(0, profile.api_calls_this_month || 0);
      const effectiveMonthlyLimit = getEffectiveMonthlyLimit(
        profileWithCustomLimits,
        tierConfig.limits.monthly,
      );
      const monthRemaining = Math.max(0, effectiveMonthlyLimit - monthlyUsed);

      const activeCustomDailyLimit = getActiveCustomDailyLimit(
        profileWithCustomLimits,
      );
      const effectiveDailyLimit =
        activeCustomDailyLimit ??
        (hasUnlimitedDailyLimit(profile, pricingLimitsMode)
          ? null
          : tierConfig.limits.daily);

      const dayRemaining =
        effectiveDailyLimit === null
          ? null
          : Math.max(0, effectiveDailyLimit - dayCount);
      const planRemaining =
        dayRemaining === null
          ? monthRemaining
          : Math.min(dayRemaining, monthRemaining);
      const available = planRemaining + packCredits;

      let reason: GenerationCapacity["reason"] | undefined;
      let message: string | undefined;
      if (available === 0) {
        if (monthRemaining === 0) {
          reason = "monthly_limit";
          message =
            "Monthly usage limit reached. Please upgrade your plan or try again next month.";
        } else if (dayRemaining === 0) {
          reason = "daily_limit";
          message =
            "Daily usage limit reached. Please try again tomorrow or upgrade your plan.";
        }
      }

      return {
        ...baseCapacity,
        allowed: available > 0,
        available,
        reason,
        message,
        limits: {
          daily: effectiveDailyLimit,
          monthly: effectiveMonthlyLimit,
          burstPerMinute: tierConfig.limits.burst.perMinute,
        },
        remaining: {
          minute: Math.max(0, tierConfig.limits.burst.perMinute - minuteCount),
          day: dayRemaining,
          month: monthRemaining,
          packCredits,
        },
      };
    } catch (err) {
      console.error("Generation capacity error:", err);
      return {
        ...baseCapacity,
        allowed: false,
        available: 0,
        reason: "service_unavailable",
        message: "Could not check generation capacity. Please try again.",
        remaining: { day: null, month: 0, packCredits },
      };
    }
  }

  // Record successful API generation - only call this after OpenAI succeeds
  static async recordSuccessfulRequest(
    userId: string,
    pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
  ): Promise<void> {
    try {
      // Fetch user's profile to determine if we should write a daily counter
      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "subscription_status, subscription_tier, api_calls_this_month, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at",
        )
        .eq("id", userId)
        .single();

      const ops: PromiseLike<any>[] = [
        this.incrementCount(userId, "minute"),
        this.updateGlobalStats(),
      ];

      const effectiveTier = profile ? getEffectiveTier(profile) : "free";
      if (pricingLimitsMode === "current" && effectiveTier === "free") {
        const freeUsed = Math.max(
          0,
          profile?.free_lifetime_generations_used || 0,
        );
        const packCredits = Math.max(0, profile?.pack_credits || 0);

        if (freeUsed < FREE_LIFETIME_LIMIT) {
          ops.push(
            supabase
              .from("profiles")
              .update({
                free_lifetime_generations_used: freeUsed + 1,
              })
              .eq("id", userId),
          );
        } else if (packCredits > 0) {
          const { error: consumeError } = await supabase.rpc(
            "consume_pack_credit",
            {
              p_user_id: userId,
              p_metadata: {
                source: "api_generate",
              },
            },
          );

          if (consumeError) {
            console.error("Failed to consume pack credit:", consumeError);
          }
        }
      } else {
        const paidProfile = profile!;
        const tierConfig = getTierConfigForProfile(
          paidProfile,
          pricingLimitsMode,
        );
        const dayCount = await this.getCurrentCount(userId, "day");
        const customDailyLimit = getActiveCustomDailyLimit(paidProfile);
        const dailyLimit =
          customDailyLimit ??
          (hasUnlimitedDailyLimit(paidProfile, pricingLimitsMode)
            ? null
            : tierConfig.limits.daily);
        const monthlyLimit = getEffectiveMonthlyLimit(
          paidProfile,
          tierConfig.limits.monthly,
        );
        const isOverPlan =
          (dailyLimit !== null && dayCount >= dailyLimit) ||
          (paidProfile.api_calls_this_month || 0) >= monthlyLimit;

        if (isOverPlan && Math.max(0, paidProfile.pack_credits || 0) > 0) {
          const { error: consumeError } = await supabase.rpc(
            "consume_pack_credit",
            {
              p_user_id: userId,
              p_metadata: {
                source: "api_generate",
                over_plan_top_up: true,
              },
            },
          );

          if (consumeError) {
            console.error(
              "Failed to consume pack top-up credit:",
              consumeError,
            );
          }
        }

        if (dailyLimit !== null) {
          ops.push(this.incrementCount(userId, "day"));
        }
      }

      await Promise.all(ops);
    } catch (err) {
      console.error("Error recording successful request:", err);
      // Don't throw here to avoid failing the API response
    }
  }

  // Cleanup expired rate limit records
  static async cleanupExpiredRecords(): Promise<void> {
    try {
      const now = new Date().toISOString();
      await supabase.from("rate_limits").delete().lt("expires_at", now);

      console.log("Cleaned up expired rate limit records");
    } catch (err) {
      console.error("Error cleaning up rate limit records:", err);
    }
  }
}
