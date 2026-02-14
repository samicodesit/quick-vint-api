import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { supabase } from "../../utils/supabaseClient";
import { TIER_CONFIGS } from "../../utils/tierConfig";
import {
  BRAND,
  TEMPLATES,
  wrapEmailLayout,
  getTemplateIndex,
} from "../../utils/emailTemplates";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    } else if (action === "send-campaign") {
      return handleSendCampaign(req, res);
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
        `id, user_id, user_email, endpoint, request_method, origin, ip_address, image_urls, raw_prompt, generated_title, generated_description, response_status, openai_model, openai_tokens_used, subscription_tier, subscription_status, api_calls_count, created_at, processing_duration_ms, suspicious_activity, flagged_reason`,
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
      b.date.localeCompare(a.date),
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
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: topUsersByUsage } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end",
      )
      .order("api_calls_this_month", { ascending: false })
      .limit(50);

    // Fetch profiles for recently active users
    const recentUserIds = Array.from(lastActiveMap.keys());
    let recentUsers: any[] = [];
    if (recentUserIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, email, api_calls_this_month, subscription_tier, subscription_status, created_at, current_period_end",
        )
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
      const tierConfig =
        TIER_CONFIGS[user.subscription_tier as keyof typeof TIER_CONFIGS] ||
        TIER_CONFIGS.free;
      return {
        ...user,
        last_active: lastActiveMap.get(user.id) || user.created_at,
        limits,
        max_limits: {
          day: tierConfig.limits.daily,
          month: tierConfig.limits.monthly,
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
      today: {
        totalRequests: todayStats?.total_api_calls || 0,
        rateLimitErrors: 0, // Not currently tracked in daily_stats
        avgTokensPerRequest: 0, // Not currently tracked
        estimatedCost: todayStats?.estimated_cost || 0,
      },
      lastWeek: weekStats,
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
  adminId: string,
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
  const html = wrapEmailLayout(template.body, template.preheader, demoUnsubUrl);

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
      const html = wrapEmailLayout(bodyHtml, preheader, demoUnsubUrl);

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
        .in("email", recipient_emails);

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
      const html = wrapEmailLayout(bodyHtml, preheader, unsubUrl);

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
