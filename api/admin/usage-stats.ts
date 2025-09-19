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

    // Get current active rate limits
    const { data: activeLimits } = await supabase
      .from("rate_limits")
      .select("user_id, window_type, count, expires_at")
      .gt("expires_at", new Date().toISOString())
      .order("count", { ascending: false })
      .limit(20);

    return res.status(200).json({
      today: {
        date: todayStr,
        totalRequests: todayStats?.total_api_calls || 0,
        estimatedCost: todayStats?.estimated_cost || 0,
      },
      lastWeek: weekStats || [],
      topUsers: combinedUsers || [],
      activeRateLimits: activeLimits || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching usage stats:", error);
    return res.status(500).json({ error: error.message });
  }
}
