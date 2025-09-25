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
      limits: { daily: 2, monthly: 10, burst: { perMinute: 3, perHour: 5 } },
      features: ["AI-generated titles and descriptions", "Basic support"]
    },
    starter: {
      limits: { daily: 15, monthly: 300, burst: { perMinute: 10, perHour: 40 } },
      features: ["AI-generated titles and descriptions", "Priority support", "Up to 15 listings per day"]
    },
    pro: {
      limits: { daily: 40, monthly: 800, burst: { perMinute: 20, perHour: 80 } },
      features: ["Everything in Starter", "Up to 40 listings per day", "Priority processing"]
    },
    business: {
      limits: { daily: 75, monthly: 1500, burst: { perMinute: 30, perHour: 120 } },
      features: ["Everything in Pro", "Up to 75 listings per day", "Dedicated support"]
    }
  };
}

// Global cost protection
const GLOBAL_DAILY_BUDGET_USD = 100; // Increased for business growth
const OPENAI_COST_PER_REQUEST_USD = 0.0201; // Based on actual dashboard: $6.12/304 requests

interface TierConfig {
  limits: {
    daily: number;
    monthly: number;
    burst: { perMinute: number; perHour: number; };
  };
  features: string[];
}

interface RateLimitResult {
  allowed: boolean;
  error?: string;
  remainingRequests?: {
    minute: number;
    hour: number;
    day: number;
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
      'unlimited_monthly': 'starter',  // €3.99 → 15/day (only existing tier)
      'starter': 'starter', 
      'pro': 'pro',
      'business': 'business',
    };

    const tierKey = tierMapping[profile.subscription_tier] || 'free';
    return TIER_CONFIGS[tierKey] || TIER_CONFIGS.free;
  }
  private static async getTimeBasedKey(
    userId: string,
    window: string,
  ): Promise<string> {
    const now = new Date();
    let timeKey: string;

    switch (window) {
      case "minute":
        timeKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
        break;
      case "hour":
        timeKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        break;
      case "day":
        timeKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
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

      // Calculate expiry time based on window
      const expiryDate = new Date();
      switch (window) {
        case "minute":
          expiryDate.setMinutes(expiryDate.getMinutes() + 2); // 2 minute buffer
          break;
        case "hour":
          expiryDate.setHours(expiryDate.getHours() + 2); // 2 hour buffer
          break;
        case "day":
          expiryDate.setDate(expiryDate.getDate() + 2); // 2 day buffer
          break;
      }

      // Upsert the count
      const { data: existing } = await supabase
        .from("rate_limits")
        .select("count")
        .eq("key", key)
        .eq("user_id", userId)
        .single();

      if (existing) {
        await supabase
          .from("rate_limits")
          .update({
            count: existing.count + 1,
            updated_at: now,
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
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

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
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
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
        .select("custom_daily_limit, custom_limit_expires_at, custom_limit_reason")
        .eq("id", userId)
        .single();

      let effectiveDailyLimit: number;
      let tierConfig = this.getTierConfig(profile);

      // Use custom limit if it exists and hasn't expired
      if (customLimits?.custom_daily_limit && 
          customLimits.custom_limit_expires_at && 
          new Date(customLimits.custom_limit_expires_at) > new Date()) {
        effectiveDailyLimit = customLimits.custom_daily_limit;
        console.log(`Using custom daily limit for user ${userId}: ${effectiveDailyLimit} (reason: ${customLimits.custom_limit_reason})`);
      } else {
        effectiveDailyLimit = tierConfig.limits.daily;
      }

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
      const hourCount = await this.getCurrentCount(userId, "hour");
      const dayCount = await this.getCurrentCount(userId, "day");

      if (minuteCount >= tierConfig.limits.burst.perMinute) {
        return {
          allowed: false,
          error: "Too many requests. Please wait a moment before trying again.",
        };
      }

      if (hourCount >= tierConfig.limits.burst.perHour) {
        return {
          allowed: false,
          error: "Too many requests. Please try again later.",
        };
      }

      if (dayCount >= effectiveDailyLimit) {
        return {
          allowed: false,
          error: "Daily usage limit reached. Please try again tomorrow or upgrade your plan.",
        };
      }

      // 5. All checks passed - increment counters
      await Promise.all([
        this.incrementCount(userId, "minute"),
        this.incrementCount(userId, "hour"),
        this.incrementCount(userId, "day"),
        this.updateGlobalStats(),
      ]);

      return {
        allowed: true,
        remainingRequests: {
          minute: Math.max(0, tierConfig.limits.burst.perMinute - minuteCount - 1),
          hour: Math.max(0, tierConfig.limits.burst.perHour - hourCount - 1),
          day: Math.max(0, effectiveDailyLimit - dayCount - 1),
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
