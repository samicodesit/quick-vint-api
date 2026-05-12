// utils/rateLimiter.ts
import { supabase } from "./supabaseClient";

// Import tier configs if available, otherwise use fallback
let TIER_CONFIGS: any;
try {
  TIER_CONFIGS = require("./tierConfig").TIER_CONFIGS;
} catch {
  // Fallback for backward compatibility
  TIER_CONFIGS = {
    free: {
      limits: { daily: 2, monthly: 8, burst: { perMinute: 3 } },
      features: ["AI-generated titles and descriptions", "Basic support"],
    },
    starter: {
      limits: { daily: 15, monthly: 300, burst: { perMinute: 10 } },
      features: [
        "AI-generated titles and descriptions",
        "Priority support",
        "Up to 15 listings per day",
      ],
    },
    pro: {
      limits: { daily: 40, monthly: 800, burst: { perMinute: 20 } },
      features: [
        "Everything in Starter",
        "Up to 40 listings per day",
        "Priority processing",
      ],
    },
    business: {
      limits: { daily: 75, monthly: 1500, burst: { perMinute: 30 } },
      features: [
        "Everything in Pro",
        "Up to 75 listings per day",
        "Dedicated support",
      ],
    },
  };
}

// Global cost protection
const GLOBAL_DAILY_BUDGET_USD = 100; // Increased for business growth
const OPENAI_COST_PER_REQUEST_USD = 0.0201; // Based on actual dashboard: $6.12/304 requests

interface TierConfig {
  limits: {
    daily: number;
    monthly: number;
    burst: { perMinute: number };
  };
  features: string[];
}

interface RateLimitResult {
  allowed: boolean;
  error?: string;
  remainingRequests?: {
    minute: number;
    day?: number | null;
    month: number;
  };
}

interface UserProfile {
  subscription_status: string;
  subscription_tier: string;
  api_calls_this_month: number;
}

export class RateLimiter {
  // Get user's tier configuration
  private static getTierConfig(profile: UserProfile): TierConfig {
    const isActive = profile.subscription_status === "active";

    if (!isActive) {
      return TIER_CONFIGS.free;
    }

    // Map existing tier names to new ones (only unlimited_monthly exists)
    const tierMapping: Record<string, string> = {
      unlimited_monthly: "starter", // €3.99 → 15/day (only existing tier)
      starter: "starter",
      pro: "pro",
      business: "business",
    };

    const tierKey = tierMapping[profile.subscription_tier] || "free";
    return TIER_CONFIGS[tierKey] || TIER_CONFIGS.free;
  }
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
          error: "Service temporarily unavailable. Please try again later.",
        };
      }

      // 1. Check global budget
      const globalBudgetOk = await this.checkGlobalBudget();
      if (!globalBudgetOk) {
        return {
          allowed: false,
          error:
            "Service temporarily unavailable due to daily budget limits. Please try again later.",
        };
      }

      // 2. Check for custom user limits first
      const { data: customLimits } = await supabase
        .from("profiles")
        .select(
          "custom_daily_limit, custom_limit_expires_at, custom_limit_reason",
        )
        .eq("id", userId)
        .single();

      const tierConfig = this.getTierConfig(profile);

      // 3. Check monthly limit (existing logic)
      if (profile.api_calls_this_month >= tierConfig.limits.monthly) {
        return {
          allowed: false,
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
          error: "Too many requests. Please wait a moment before trying again.",
        };
      }
      // 5. Check daily limits (if applicable)
      // Business tier is exempt from daily limits
      let effectiveDailyLimit: number | null = null;
      if (profile.subscription_tier !== "business") {
        if (
          customLimits?.custom_daily_limit &&
          customLimits.custom_limit_expires_at &&
          new Date(customLimits.custom_limit_expires_at) > new Date()
        ) {
          effectiveDailyLimit = customLimits.custom_daily_limit;
        } else {
          effectiveDailyLimit = tierConfig.limits.daily;
        }

        if (effectiveDailyLimit !== null && dayCount >= effectiveDailyLimit) {
          return {
            allowed: false,
            error:
              "Daily usage limit reached. Please try again tomorrow or upgrade your plan.",
          };
        }
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
            tierConfig.limits.monthly - profile.api_calls_this_month - 1,
          ),
        },
      };
    } catch (err) {
      console.error("Rate limiter error:", err);
      // On error, allow the request but log the issue
      return { allowed: true };
    }
  }

  // Record successful API generation - only call this after OpenAI succeeds
  static async recordSuccessfulRequest(userId: string): Promise<void> {
    try {
      // Fetch user's profile to determine if we should write a daily counter
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .single();

      const isBusiness = profile?.subscription_tier === "business";

      const ops: Promise<any>[] = [
        this.incrementCount(userId, "minute"),
        this.updateGlobalStats(),
      ];
      // Only track daily counters for non-business users (business tier is exempt)
      if (!isBusiness) {
        ops.push(this.incrementCount(userId, "day"));
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
