import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { sendSubscriptionWelcomeEmailOnce } from "../../utils/subscriptionWelcomeEmail";

type WelcomeEmailRow = {
  user_id: string;
  email: string;
  tier: string;
  stripe_subscription_id: string;
  stripe_checkout_session_id: string | null;
};

async function fetchRetryRows(nowIso: string) {
  const [dueRows, expiredSendingRows] = await Promise.all([
    supabase
      .from("subscription_welcome_emails")
      .select(
        "user_id,email,tier,stripe_subscription_id,stripe_checkout_session_id",
      )
      .in("status", ["pending", "failed"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("subscription_welcome_emails")
      .select(
        "user_id,email,tier,stripe_subscription_id,stripe_checkout_session_id",
      )
      .eq("status", "sending")
      .lt("locked_until", nowIso)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  if (dueRows.error) throw dueRows.error;
  if (expiredSendingRows.error) throw expiredSendingRows.error;

  const bySubscription = new Map<string, WelcomeEmailRow>();
  for (const row of [
    ...((dueRows.data || []) as WelcomeEmailRow[]),
    ...((expiredSendingRows.data || []) as WelcomeEmailRow[]),
  ]) {
    bySubscription.set(`${row.stripe_subscription_id}:${row.tier}`, row);
  }

  return Array.from(bySubscription.values()).slice(0, 20);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rows = await fetchRetryRows(new Date().toISOString());
    const results = [];

    for (const row of rows) {
      const result = await sendSubscriptionWelcomeEmailOnce({
        profileId: row.user_id,
        email: row.email,
        tier: row.tier,
        stripeSubscriptionId: row.stripe_subscription_id,
        stripeCheckoutSessionId: row.stripe_checkout_session_id,
      });
      results.push({
        email: row.email,
        stripeSubscriptionId: row.stripe_subscription_id,
        status: result.status,
      });
    }

    return res.status(200).json({
      ok: true,
      checked: rows.length,
      results,
    });
  } catch (error: any) {
    console.error("Subscription welcome retry failed:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
