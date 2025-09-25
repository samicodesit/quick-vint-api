import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed" });
  }

  // --- AUTH ---
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }
  const token = authHeader.split(" ")[1];

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Check if user is admin
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
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