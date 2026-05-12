// Runs daily. Handles the failed-payment lifecycle:
//   Day 5 of grace  → send reminder email.
//   Day 7 of grace  → downgrade to Free, freeze rollover for 14 days.
//   Day 21 of grace → expire frozen rollover permanently.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { supabase } from "../../utils/supabaseClient";
import {
  freezeSubscriptionCreditsOnFailure,
  expireFrozenRollover,
} from "../../utils/credits";
import { BRAND, TEMPLATES, wrapEmailLayout } from "../../utils/emailTemplates";

const resend = new Resend(process.env.RESEND_API_KEY);

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 7;
const FREEZE_DAYS = 14;
const TOTAL_DAYS = GRACE_DAYS + FREEZE_DAYS; // 21

async function sendEmail(
  template: "payment_failed_day5",
  userEmail: string,
  unsubscribeToken: string | null,
): Promise<void> {
  const tpl = TEMPLATES[template];
  if (!tpl) return;

  const unsubUrl = unsubscribeToken
    ? `https://autolister.app/api/unsubscribe?token=${unsubscribeToken}`
    : "https://autolister.app/api/unsubscribe";

  const html = wrapEmailLayout(tpl.body, tpl.preheader, unsubUrl);

  try {
    await resend.emails.send({
      from: BRAND.from,
      to: userEmail,
      subject: tpl.subject,
      html,
      headers: {
        "List-Unsubscribe": `<mailto:unsubscribe@autolister.app?subject=Unsubscribe>, <${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (err: any) {
    console.error(`Failed to send ${template} to ${userEmail}:`, err.message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = Date.now();
  const results = {
    day5_emails_sent: 0,
    day7_downgrades: 0,
    day21_expirations: 0,
    errors: 0,
  };

  // ── Stage 1: users in active grace period ──────────────────────────────────
  const { data: graceUsers, error: graceErr } = await supabase
    .from("profiles")
    .select(
      "id, email, unsubscribe_token, payment_grace_started_at, payment_day5_email_sent, subscription_status",
    )
    .not("payment_grace_started_at", "is", null)
    .eq("is_legacy_plan", false);

  if (graceErr) {
    console.error("payment-recovery: failed to fetch grace users:", graceErr);
    results.errors++;
  } else if (graceUsers) {
    for (const user of graceUsers) {
      try {
        const graceStartMs = new Date(user.payment_grace_started_at).getTime();
        const elapsedMs = now - graceStartMs;

        // Day 7+: downgrade to Free and freeze rollover
        if (elapsedMs >= GRACE_DAYS * DAY_MS) {
          // Only act if still in a bad payment state (not yet recovered)
          if (
            user.subscription_status === "past_due" ||
            user.subscription_status === "unpaid" ||
            user.subscription_status === "canceled"
          ) {
            const frozenUntil = new Date(
              graceStartMs + TOTAL_DAYS * DAY_MS,
            ).toISOString();

            await supabase
              .from("profiles")
              .update({
                subscription_status: "canceled",
                subscription_tier: "free",
                current_period_end: null,
                pending_tier: null,
              })
              .eq("id", user.id);

            await freezeSubscriptionCreditsOnFailure(user.id, frozenUntil);
            results.day7_downgrades++;
          }
        }
        // Day 5 (but not yet day 7): send reminder email
        else if (
          elapsedMs >= 5 * DAY_MS &&
          !user.payment_day5_email_sent &&
          user.email
        ) {
          await sendEmail(
            "payment_failed_day5",
            user.email,
            user.unsubscribe_token ?? null,
          );
          await supabase
            .from("profiles")
            .update({ payment_day5_email_sent: true })
            .eq("id", user.id);
          results.day5_emails_sent++;
        }
      } catch (err: any) {
        console.error(
          `payment-recovery: error processing grace user ${user.id}:`,
          err.message,
        );
        results.errors++;
      }
    }
  }

  // ── Stage 2: users whose rollover freeze window has expired ────────────────
  const nowIso = new Date(now).toISOString();
  const { data: frozenUsers, error: frozenErr } = await supabase
    .from("profiles")
    .select("id")
    .not("rollover_frozen_until", "is", null)
    .lte("rollover_frozen_until", nowIso)
    .eq("is_legacy_plan", false);

  if (frozenErr) {
    console.error("payment-recovery: failed to fetch frozen users:", frozenErr);
    results.errors++;
  } else if (frozenUsers) {
    for (const user of frozenUsers) {
      try {
        await expireFrozenRollover(user.id);
        results.day21_expirations++;
      } catch (err: any) {
        console.error(
          `payment-recovery: error expiring rollover for ${user.id}:`,
          err.message,
        );
        results.errors++;
      }
    }
  }

  console.log("payment-recovery:", results);
  return res.status(200).json({ success: true, ...results });
}
