import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { getPricingLimitsMode } from "../../utils/tierConfig";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (getPricingLimitsMode() !== "legacy") {
    return res.status(200).json({ success: true, skipped: true });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { error } = await supabase
    .from("profiles")
    .update({
      api_calls_this_month: 0,
      last_api_call_reset: new Date().toISOString(),
    })
    .lte("last_api_call_reset", thirtyDaysAgo.toISOString())
    .or(
      "subscription_status.is.null,subscription_status.not.in.(active,trialing,past_due,canceling)",
    );

  if (error) {
    console.error("Legacy monthly usage reset failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(200).json({ success: true, skipped: false });
}
