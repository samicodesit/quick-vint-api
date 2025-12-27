import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { TIER_CONFIGS } from "../../utils/tierConfig";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- AUTH with ADMIN_SECRET ---
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const action = req.query.action as string;

  if (req.method === "GET") {
    if (action === "view-logs" || !action) {
      return handleViewLogs(req, res);
    } else if (action === "usage-stats") {
      return handleUsageStats(req, res);
    } else {
      return res.status(400).json({ error: "Invalid GET action" });
    }
  } else if (req.method === "POST") {
    if (action === "emergency-brake") {
      return handleEmergencyBrake(req, res);
    } else if (action === "flag-activity") {
      return handleFlagActivity(req, res, "admin");
    } else {
      return res.status(400).json({ error: "Invalid POST action" });
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
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

    let query = supabase
      .from("api_logs")
      .select(
        `id, user_id, user_email, endpoint, request_method, origin, ip_address, image_urls, raw_prompt, generated_title, generated_description, response_status, openai_model, openai_tokens_used, subscription_tier, subscription_status, api_calls_count, created_at, processing_duration_ms, suspicious_activity, flagged_reason`
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (suspiciousOnly) query = query.eq("suspicious_activity", true);
    if (userId) query = query.eq("user_id", userId);
    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", endDate);

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error("Error fetching logs:", logsError);
      return res.status(500).json({ error: "Failed to fetch logs" });
    }

    let countQuery = supabase
      .from("api_logs")
      .select("*", { count: "exact", head: true });

    if (suspiciousOnly) countQuery = countQuery.eq("suspicious_activity", true);
    if (userId) countQuery = countQuery.eq("user_id", userId);
    if (startDate) countQuery = countQuery.gte("created_at", startDate);
    if (endDate) countQuery = countQuery.lte("created_at", endDate);

    const { count } = await countQuery;

    return res.status(200).json({
      logs,
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
async function handleUsageStats(req: VercelRequest, res: VercelResponse) {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const { data: todayStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", todayStr)
      .single();

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split("T")[0];

    const { data: logsLastWeek } = await supabase
      .from("api_logs")
      .select("created_at, openai_tokens_used")
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
          entry.estimated_cost += (log.openai_tokens_used || 0) * 0.0000005;
        }
      });
    }

    const weekStats = Array.from(dailyMap.values()).sort((a: any, b: any) =>
      b.date.localeCompare(a.date)
    );

    const { data: allUsers } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: topUsersByUsage } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end"
      )
      .order("api_calls_this_month", { ascending: false })
      .limit(50);

    const allUserMap = new Map();
    [...(allUsers || []), ...(topUsersByUsage || [])].forEach((user) => {
      if (user.email) allUserMap.set(user.email, user);
    });

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
      const tierConfig =
        TIER_CONFIGS[user.subscription_tier as keyof typeof TIER_CONFIGS] ||
        TIER_CONFIGS.free;
      return {
        ...user,
        limits,
        max_limits: {
          day: tierConfig.limits.daily,
          month: tierConfig.limits.monthly,
        },
      };
    });

    return res.status(200).json({
      today: {
        totalRequests: todayStats?.total_api_calls || 0,
        rateLimitErrors: 0, // Not currently tracked in daily_stats
        avgTokensPerRequest: 0, // Not currently tracked
        estimatedCost: todayStats?.estimated_cost || 0,
      },
      lastWeek: weekStats,
      topUsers: enrichedUsers,
      todaysUsage: enrichedUsers,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// --- LOGIC: Emergency Brake ---
async function handleEmergencyBrake(req: VercelRequest, res: VercelResponse) {
  const { subAction, reason } = req.body; // 'action' is used for routing, so use 'subAction' or check body

  // Actually, the original code used 'action' in body.
  // Since we use 'action' query param for routing, let's look at body.action
  // But wait, if we POST to ?action=emergency-brake, we can use body.action for enable/disable
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
  adminId: string
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
