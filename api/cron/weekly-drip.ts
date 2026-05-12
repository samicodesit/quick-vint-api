// Runs daily. Delivers 2 credits to free-tier users whose next drip is due.
// The drip fires once per week for 4 weeks (one-time per account, never resets).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { deliverWeeklyDrip } from "../../utils/credits";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();

  // Fetch free-tier non-legacy users who still have drips remaining and have a start date
  const { data: candidates, error } = await supabase
    .from("profiles")
    .select("id, free_drip_weeks_delivered, free_drip_started_at")
    .eq("is_legacy_plan", false)
    .eq("subscription_tier", "free")
    .lt("free_drip_weeks_delivered", 4)
    .not("free_drip_started_at", "is", null);

  if (error) {
    console.error("weekly-drip: failed to fetch candidates:", error);
    return res.status(500).json({ success: false, error: error.message });
  }

  if (!candidates || candidates.length === 0) {
    return res.status(200).json({ success: true, delivered: 0 });
  }

  let delivered = 0;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const TOTAL_WEEKS = 4;

  for (const user of candidates) {
    let weeksDelivered = user.free_drip_weeks_delivered ?? 0;
    const dripStarted = new Date(user.free_drip_started_at);
    const windowEnd = new Date(dripStarted.getTime() + TOTAL_WEEKS * WEEK_MS);

    // Hard cutoff: if the 4-week evaluation window has closed (e.g. the user
    // was on a paid plan during the window and cancelled back to free later),
    // expire their remaining drips without delivering credits and skip them in
    // future cron runs.
    if (now >= windowEnd) {
      const { error: expireError } = await supabase
        .from("profiles")
        .update({ free_drip_weeks_delivered: TOTAL_WEEKS })
        .eq("id", user.id);
      if (expireError) {
        console.error(
          "weekly-drip: failed to expire drip window:",
          expireError,
        );
        return res.status(500).json({
          success: false,
          error: expireError.message,
        });
      }
      continue;
    }

    // Catch up any missed weeks (e.g. if the cron skipped a day) up to the
    // 4-week total. Each week's drip is independently due once the elapsed
    // wall-clock time crosses the (n+1) * 7 day boundary.
    while (weeksDelivered < TOTAL_WEEKS) {
      const nextDripDue = new Date(
        dripStarted.getTime() + (weeksDelivered + 1) * WEEK_MS,
      );
      if (now < nextDripDue) break;
      await deliverWeeklyDrip(user.id);
      weeksDelivered++;
      delivered++;
    }
  }

  console.log(`weekly-drip: delivered to ${delivered} users`);
  return res.status(200).json({ success: true, delivered });
}
