import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
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
          reviewed_by: user.id,
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
          reviewed_by: user.id,
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
          blocked_by: user.id,
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
          reviewed_by: user.id,
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