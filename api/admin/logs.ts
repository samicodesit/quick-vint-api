import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- AUTH with ADMIN_SECRET (same as other admin endpoints) ---
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Route based on action query parameter
  const action = req.query.action as string;

  if (action === "view-logs" || !action) {
    return handleViewLogs(req, res);
  } else if (action === "flag-activity") {
    return handleFlagActivity(req, res, 'admin'); // Use 'admin' as user ID for admin actions
  } else {
    return res.status(400).json({ error: "Invalid action" });
  }
}

async function handleViewLogs(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed for view-logs" });
  }

  try {
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;
    
    const suspiciousOnly = req.query.suspicious === 'true';
    const userId = req.query.user_id as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    // Build query
    let query = supabase
      .from("api_logs")
      .select(`
        id,
        user_id,
        user_email,
        endpoint,
        request_method,
        origin,
        ip_address,
        image_urls,
        raw_prompt,
        generated_title,
        generated_description,
        response_status,
        openai_model,
        openai_tokens_used,
        subscription_tier,
        subscription_status,
        api_calls_count,
        created_at,
        processing_duration_ms,
        suspicious_activity,
        flagged_reason
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (suspiciousOnly) {
      query = query.eq('suspicious_activity', true);
    }
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error("Error fetching logs:", logsError);
      return res.status(500).json({ error: "Failed to fetch logs" });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("api_logs")
      .select("*", { count: 'exact', head: true });

    if (suspiciousOnly) {
      countQuery = countQuery.eq('suspicious_activity', true);
    }
    if (userId) {
      countQuery = countQuery.eq('user_id', userId);
    }
    if (startDate) {
      countQuery = countQuery.gte('created_at', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('created_at', endDate);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Error counting logs:", countError);
    }

    // Get some summary stats
    const { data: stats } = await supabase
      .from("api_logs")
      .select(`
        response_status,
        suspicious_activity,
        created_at
      `);

    const summary = {
      total_requests: stats?.length || 0,
      suspicious_requests: stats?.filter(s => s.suspicious_activity).length || 0,
      error_requests: stats?.filter(s => s.response_status >= 400).length || 0,
      success_requests: stats?.filter(s => s.response_status >= 200 && s.response_status < 300).length || 0,
      today_requests: stats?.filter(s => {
        const today = new Date().toDateString();
        return new Date(s.created_at).toDateString() === today;
      }).length || 0
    };

    return res.status(200).json({
      logs,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit)
      },
      summary
    });

  } catch (err: any) {
    console.error("Admin logs error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleFlagActivity(req: VercelRequest, res: VercelResponse, adminId: string) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed for flag-activity" });
  }

  try {
    const { logId, reason, action } = req.body;

    if (!logId || !reason) {
      return res.status(400).json({ 
        error: "logId and reason are required" 
      });
    }

    if (action === "flag") {
      // Flag as suspicious
      const { error: updateError } = await supabase
        .from("api_logs")
        .update({
          suspicious_activity: true,
          flagged_reason: reason,
          reviewed_by: null, // We don't have a user ID with ADMIN_SECRET auth
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", logId);

      if (updateError) {
        console.error("Error flagging log:", updateError);
        return res.status(500).json({ error: "Failed to flag log" });
      }

      return res.status(200).json({ 
        success: true, 
        message: "Log flagged as suspicious" 
      });

    } else if (action === "unflag") {
      // Remove suspicious flag
      const { error: updateError } = await supabase
        .from("api_logs")
        .update({
          suspicious_activity: false,
          flagged_reason: `Previously flagged but reviewed by admin: ${reason}`,
          reviewed_by: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", logId);

      if (updateError) {
        console.error("Error unflagging log:", updateError);
        return res.status(500).json({ error: "Failed to unflag log" });
      }

      return res.status(200).json({ 
        success: true, 
        message: "Log unflagged" 
      });

    } else if (action === "block_user") {
      // Get the user_id from the log first
      const { data: logData, error: logError } = await supabase
        .from("api_logs")
        .select("user_id")
        .eq("id", logId)
        .single();

      if (logError || !logData) {
        return res.status(400).json({ error: "Log not found" });
      }

      // Block the user (assuming you have a way to block users)
      const { error: blockError } = await supabase
        .from("profiles")
        .update({
          account_status: "blocked",
          blocked_reason: reason,
          blocked_by: null, // Admin secret user
          blocked_at: new Date().toISOString(),
        })
        .eq("id", logData.user_id);

      if (blockError) {
        console.error("Error blocking user:", blockError);
        return res.status(500).json({ error: "Failed to block user" });
      }

      // Also flag the log
      await supabase
        .from("api_logs")
        .update({
          suspicious_activity: true,
          flagged_reason: `User blocked: ${reason}`,
          reviewed_by: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", logId);

      return res.status(200).json({ 
        success: true, 
        message: "User blocked and log flagged" 
      });
    }

    return res.status(400).json({ 
      error: "Invalid action. Use 'flag', 'unflag', or 'block_user'" 
    });

  } catch (err: any) {
    console.error("Admin flag error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}