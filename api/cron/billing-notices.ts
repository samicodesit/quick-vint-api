import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { deliverBillingNotice } from "../../utils/billingNotices";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  )
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("billing_notices")
      .select("key")
      .in("status", ["pending", "failed", "sending"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("created_at")
      .limit(30);
    if (error) throw error;
    const outcomes = [];
    for (const row of data || [])
      outcomes.push(await deliverBillingNotice(row.key));
    const { count, error: countError } = await supabase
      .from("billing_notices")
      .select("key", { count: "exact", head: true })
      .eq("status", "manual_review");
    if (countError) throw countError;
    const { count: welcomeReview, error: welcomeError } = await supabase
      .from("subscription_welcome_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "manual_review");
    if (welcomeError) throw welcomeError;
    const { count: unhandled, error: withdrawalError } = await supabase
      .from("billing_withdrawals")
      .select("id", { count: "exact", head: true })
      .neq("status", "resolved")
      .lt("received_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    if (withdrawalError) throw withdrawalError;
    if (count || welcomeReview || unhandled || outcomes.includes("failed"))
      throw new Error(
        "Billing notices or withdrawal requests require attention",
      );
    return res.json({ processed: outcomes.length });
  } catch (error) {
    reportCriticalEndpointFailure({
      error,
      endpoint: "/api/cron/billing-notices",
      status: 500,
    });
    return res.status(500).json({ error: "Billing notice processing failed" });
  }
}
