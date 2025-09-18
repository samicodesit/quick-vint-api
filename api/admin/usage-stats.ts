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
    // Get today's stats
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    const { data: todayStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", todayStr)
      .single();

    // Get last 7 days stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = `${weekAgo.getFullYear()}-${weekAgo.getMonth()}-${weekAgo.getDate()}`;

    const { data: weekStats } = await supabase
      .from("daily_stats")
      .select("*")
      .gte("date", weekAgoStr)
      .order("date", { ascending: false });

    // Get top users by API calls this month
    const { data: topUsers } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status",
      )
      .order("api_calls_this_month", { ascending: false })
      .limit(10);

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
      topUsers: topUsers || [],
      activeRateLimits: activeLimits || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching usage stats:", error);
    return res.status(500).json({ error: error.message });
  }
}
