import Stripe from "stripe";
import { Resend } from "resend";
import { billingEvidenceHash } from "./billingEvidenceHash";
import { supabase } from "./supabaseClient";
import { BRAND, wrapDirectReplyLayout } from "./emailTemplates";
import { escapeBillingHtml } from "./subscriptionPolicyHtml";

export type BillingNotice = {
  key: string;
  email: string;
  stripe_subscription_id?: string | null;
  kind: string;
  context?: { canceled_at: number | null; effective_end: number };
  payload: {
    from: string;
    to: string[];
    reply_to: string;
    subject: string;
    html: string;
  };
};

export function billingNoticePayload(
  email: string,
  subject: string,
  body: string,
) {
  return {
    from: BRAND.from,
    to: [email],
    reply_to: BRAND.supportEmail,
    subject,
    html: wrapDirectReplyLayout(body, subject),
  };
}

export function cancellationNotice(
  event: Stripe.Event,
  email: string,
): BillingNotice | null {
  const sub = event.data.object as any;
  const previous = event.data.previous_attributes as any;
  if (
    event.type !== "customer.subscription.updated" ||
    !sub.cancel_at_period_end ||
    previous?.cancel_at_period_end !== false
  )
    return null;
  const end =
    sub.cancel_at ||
    sub.items?.data?.[0]?.current_period_end ||
    sub.current_period_end;
  if (typeof end !== "number" || !Number.isFinite(end))
    throw new Error("Cancellation has no effective end date");
  const endText =
    new Date(end * 1000).toLocaleString("en-GB", {
      timeZone: "UTC",
      dateStyle: "long",
      timeStyle: "short",
    }) + " UTC";
  return {
    key: `cancel-renewal/${sub.id}/${sub.canceled_at || event.id}/${end}`,
    context: { canceled_at: sub.canceled_at || null, effective_end: end },
    kind: "cancel_renewal/2026-10-28",
    email,
    stripe_subscription_id: sub.id,
    payload: billingNoticePayload(
      email,
      "Your AutoLister renewal has been stopped",
      `<h2>Renewal has been stopped.</h2><p>Your paid access ends on ${escapeBillingHtml(endText)}.</p><p>This confirmation does not itself confirm a refund. Your statutory rights remain unaffected.</p><p><a href="${BRAND.billingPortalUrl}">Manage subscription</a> · <a href="mailto:${BRAND.supportEmail}">Contact support</a></p>`,
    ),
  };
}

export async function queueBillingNotice(notice: BillingNotice) {
  const { error } = await supabase
    .from("billing_notices")
    .insert({ ...notice, payload_sha256: billingEvidenceHash(notice.payload) });
  if (error && error.code !== "23505") throw error;
}

export async function deliverBillingNotice(key: string) {
  const { data, error } = await supabase.rpc("claim_billing_notice", {
    p_key: key,
  });
  if (error) throw error;
  const claim = data?.[0];
  if (!claim) return "skipped";
  let acceptedEmailId: string | null = null;
  try {
    if (claim.kind === "cancel_renewal/2026-10-28") {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const current = (await stripe.subscriptions.retrieve(
        claim.stripe_subscription_id,
      )) as any;
      const end =
        current.cancel_at ||
        current.items?.data?.[0]?.current_period_end ||
        current.current_period_end;
      if (
        !current.cancel_at_period_end ||
        current.canceled_at !== claim.context.canceled_at ||
        end !== claim.context.effective_end
      ) {
        const { error: staleError } = await supabase
          .from("billing_notices")
          .update({ status: "superseded", locked_until: null })
          .eq("key", key)
          .eq("lease", claim.lease);
        if (staleError) throw staleError;
        return "superseded";
      }
    }
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      claim.payload,
      { idempotencyKey: key },
    );
    if (result.error || !result.data?.id)
      throw new Error(result.error?.message || "Resend returned no message ID");
    acceptedEmailId = result.data.id;
    const { error: saveError } = await supabase
      .from("billing_notices")
      .update({
        status: "sent",
        resend_email_id: result.data.id,
        sent_at: new Date().toISOString(),
        locked_until: null,
        last_error: null,
      })
      .eq("key", key)
      .eq("lease", claim.lease);
    if (saveError) throw saveError;
    return "sent";
  } catch (error) {
    const { error: saveError } = await supabase
      .from("billing_notices")
      .update({
        status: acceptedEmailId ? "manual_review" : "failed",
        ...(acceptedEmailId ? { resend_email_id: acceptedEmailId } : {}),
        locked_until: null,
        next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        last_error: String(error).slice(0, 500),
      })
      .eq("key", key)
      .eq("lease", claim.lease);
    if (saveError) throw saveError;
    return "failed";
  }
}
