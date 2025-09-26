// api/admin/usage-stats.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { TIER_CONFIGS } from "../../utils/tierConfig";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Secure the endpoint with admin secret
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get today's stats with proper date formatting
    // Use UTC date string so daily_stats and rate limiter (which is UTC-aligned) match
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD (UTC)

    const { data: todayStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", todayStr)
      .single();

    // Get last 7 days stats
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split("T")[0];

    const { data: weekStats } = await supabase
      .from("daily_stats")
      .select("*")
      .gte("date", weekAgoStr)
      .order("date", { ascending: false });

    // Get ALL users (or more users) to ensure we don't miss recent signups
    const { data: allUsers } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end"
      )
      .order("created_at", { ascending: false }) // Order by creation date first to get recent signups
      .limit(200); // Increased limit to catch all recent users

    // Also get top users by API calls for the usage table
    const { data: topUsersByUsage } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end"
      )
      .order("api_calls_this_month", { ascending: false })
      .limit(50);

    // Combine and deduplicate users
    const allUserMap = new Map();
    [...(allUsers || []), ...(topUsersByUsage || [])].forEach((user) => {
      if (user.email) {
        allUserMap.set(user.email, user);
      }
    });

    const combinedUsers = Array.from(allUserMap.values());

    // Get all active rate limits for all window types
    // Include active rate_limits that either have a future expires_at OR no expiry recorded (null)
    const nowIso = new Date().toISOString();
    const { data: allRateLimits } = await supabase
      .from("rate_limits")
      .select("user_id, window_type, count, expires_at")
      .or(`expires_at.gte.${nowIso},expires_at.is.null`)
      .order("count", { ascending: false })
      .limit(500);

    // Use canonical tier config for limits (single source of truth)
    function getTierLimits(tierName: string) {
      // Normalize legacy tier names to current keys
      const tierMapping: Record<string, string> = {
        unlimited_monthly: "starter",
        starter: "starter",
        pro: "pro",
        business: "business",
        free: "free",
      };
      const key = tierMapping[tierName] || "free";
      const tier = TIER_CONFIGS[key] || TIER_CONFIGS.free;
      return {
        day: tier.limits.daily,
        month: tier.limits.monthly,
        minute: tier.limits.burst.perMinute,
      };
    }

    // Build a map of userId -> array of active limits
    const userLimitsMap: Record<string, Array<any>> = {};
    if (allRateLimits) {
      for (const limit of allRateLimits) {
        if (limit.window_type === "hour") continue; // Skip hourly limits
        if (!userLimitsMap[limit.user_id]) userLimitsMap[limit.user_id] = [];
        userLimitsMap[limit.user_id].push(limit);
      }
    }

    // For each user, attach all their active limits and compute canonical max limits
    const usageWithLimits: Array<any> = [];
    if (combinedUsers) {
      for (const user of combinedUsers) {
        const userTier = user.subscription_tier || "free";
        const limits = userLimitsMap[user.id] || [];

        // Ensure monthly synthetic entry exists so UI can display monthly usage
        const hasMonth = limits.some((l) => l.window_type === "month");
        if (!hasMonth) {
          // Synthetic monthly entry: prefer the subscription's current_period_end (per-user billing period)
          // Fall back to UTC start-of-next-month if no subscription period end is available
          let syntheticExpiry = null;
          if (user.current_period_end) {
            syntheticExpiry = new Date(user.current_period_end).toISOString();
          } else {
            const now2 = new Date();
            syntheticExpiry = new Date(
              Date.UTC(
                now2.getUTCFullYear(),
                now2.getUTCMonth() + 1,
                1,
                0,
                0,
                0,
                0
              )
            ).toISOString();
          }
          limits.push({
            user_id: user.id,
            window_type: "month",
            count: user.api_calls_this_month || 0,
            expires_at: syntheticExpiry,
          });
        }

        const tierLimits = getTierLimits(userTier);

        const maxLimits = {
          minute: tierLimits.minute,
          day: tierLimits.day,
          month: tierLimits.month,
        };

        // Only include users with more than 0 usage across any returned limit
        const totalUsage = (limits || []).reduce(
          (sum: number, l: any) => sum + (l.count || 0),
          0
        );
        if (totalUsage <= 0) continue;

        usageWithLimits.push({
          user_id: user.id,
          email: user.email,
          tier: userTier,
          daily_limit: tierLimits.day,
          limits, // array of {window_type, count, expires_at}
          max_limits: maxLimits,
        });
      }
    }

    return res.status(200).json({
      today: {
        date: todayStr,
        totalRequests:
          typeof todayStats?.total_api_calls === "number"
            ? todayStats.total_api_calls
            : 0,
        estimatedCost:
          typeof todayStats?.estimated_cost === "number"
            ? todayStats.estimated_cost
            : 0,
      },
      lastWeek: weekStats || [],
      topUsers: combinedUsers || [],
      todaysUsage: usageWithLimits || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching usage stats:", error);
    return res.status(500).json({ error: error.message });
  }
}
