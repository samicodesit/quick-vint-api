// api/admin/usage-stats.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";

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
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of day
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD format

    const { data: todayStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", todayStr)
      .single();

    // Get last 7 days stats
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
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
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at"
      )
      .order("created_at", { ascending: false }) // Order by creation date first to get recent signups
      .limit(200); // Increased limit to catch all recent users

    // Also get top users by API calls for the usage table
    const { data: topUsersByUsage } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at"
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

    // Get all of today's daily usage data
    const { data: rateLimitData } = await supabase
      .from("rate_limits")
      .select("user_id, window_type, count, expires_at")
      .gt("expires_at", new Date().toISOString())
      .eq("window_type", "day") // Focus only on daily limits
      .order("count", { ascending: false })
      .limit(200); // Get up to 200 records for today

    // Enrich the usage data with user details and tier limits
    const tierLimits: Record<string, number> = {
      free: 2,
      unlimited_monthly: 15, // Legacy
      starter: 15,
      pro: 40,
      business: 75,
    };

    const todaysUsage = [];
    if (combinedUsers) {
      for (const user of combinedUsers) {
        const userTier = user.subscription_tier || "free";
        const dailyLimit = tierLimits[userTier] || tierLimits.free;
        // Find today's rate limit record for this user
        const limit = rateLimitData?.find((l) => l.user_id === user.id);
        const count = limit?.count || 0;
        const expires_at = limit?.expires_at || null;
        const isBlocked = count >= dailyLimit;

        todaysUsage.push({
          user_id: user.id,
          email: user.email,
          tier: userTier,
          daily_limit: dailyLimit,
          count,
          is_blocked: isBlocked,
          expires_at,
        });
      }
    }

    return res.status(200).json({
      today: {
        date: todayStr,
        totalRequests: todayStats?.total_api_calls || 0,
        estimatedCost: todayStats?.estimated_cost || 0,
      },
      lastWeek: weekStats || [],
      topUsers: combinedUsers || [],
      todaysUsage: todaysUsage || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching usage stats:", error);
    return res.status(500).json({ error: error.message });
  }
}
