// api/cron/reset-counts.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Secure the endpoint
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Calculate the date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find and update all profiles whose current period started more than 30 days ago
  const { data, error } = await supabase
    .from("profiles")
    .update({
      api_calls_this_month: 0,
      // Reset the period start to today for the next 30-day cycle
      last_api_call_reset: new Date().toISOString(),
    })
    .lte("last_api_call_reset", thirtyDaysAgo.toISOString()); // Use 'lte' (less than or equal)

  if (error) {
    console.error("Daily cron job failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }

  console.log("Daily cron job for usage reset ran successfully.");
  return res
    .status(200)
    .json({ success: true, message: "Usage counts checked for reset." });
}
