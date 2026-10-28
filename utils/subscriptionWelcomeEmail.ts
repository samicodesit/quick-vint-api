import { Resend } from "resend";
import { billingEvidenceHash } from "./billingEvidenceHash";
import { ApiLogger } from "./apiLogger";
import {
  BRAND,
  TEMPLATES,
  getPaidWelcomeTemplate,
  type PaidWelcomeBilling,
  type PaidWelcomeLimits,
  wrapDirectReplyLayout,
} from "./emailTemplates";
import { supabase } from "./supabaseClient";

type PaidTier = "starter" | "pro" | "business";
type WelcomePayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
};

type WelcomeClaim = {
  id: string;
  idempotency_key: string;
  status?: string;
  locked_until?: string | null;
  attempts?: number | null;
  payload?: WelcomePayload | null;
  first_attempt_at?: string | null;
};

type SendInput = {
  profileId: string;
  email: string;
  tier: string;
  stripeSubscriptionId: string;
  stripeCheckoutSessionId?: string | null;
  isLegacyPlan?: boolean | null;
  billing?: PaidWelcomeBilling;
  limits?: PaidWelcomeLimits | null;
  isCustomPlan?: boolean;
};

const resend = new Resend(process.env.RESEND_API_KEY);
const WELCOME_TEMPLATE_BY_TIER: Record<PaidTier, string> = {
  starter: "starter_welcome_v1",
  pro: "pro_welcome_v1",
  business: "business_welcome_v1",
};

function normalizeTier(tier: string): PaidTier | null {
  return tier === "starter" || tier === "pro" || tier === "business"
    ? tier
    : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown");
}

function nextAttemptIso() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

function lockUntilIso() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

async function markWelcomeEmail(
  claimId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("subscription_welcome_emails")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) {
    throw error;
  }
}

async function reserveWelcomeEmailClaim(input: {
  profileId: string;
  email: string;
  tier: PaidTier;
  templateKey: string;
  stripeSubscriptionId: string;
  stripeCheckoutSessionId?: string | null;
  idempotencyKey: string;
  payload: WelcomePayload;
  renewalStopped?: boolean;
}): Promise<WelcomeClaim | null> {
  const nowIso = new Date().toISOString();
  const lockedUntil = lockUntilIso();

  const { data: inserted, error: insertError } = await supabase
    .from("subscription_welcome_emails")
    .insert({
      user_id: input.profileId,
      email: input.email,
      tier: input.tier,
      template_key: input.templateKey,
      stripe_subscription_id: input.stripeSubscriptionId,
      stripe_checkout_session_id: input.stripeCheckoutSessionId || null,
      idempotency_key: input.idempotencyKey,
      payload: input.payload,
      payload_sha256: billingEvidenceHash(input.payload),
      content_version: "paid-welcome/2026-10-28",
      first_attempt_at: nowIso,
      status: "sending",
      attempts: 1,
      locked_until: lockedUntil,
      next_attempt_at: null,
    })
    .select("id,idempotency_key,payload")
    .single();

  if (inserted)
    return {
      ...inserted,
      payload: inserted.payload || input.payload,
    } as WelcomeClaim;
  if (!insertError) {
    throw new Error("Failed to reserve subscription welcome email");
  }
  if (insertError.code !== "23505") throw insertError;

  const { data: existing, error: selectError } = await supabase
    .from("subscription_welcome_emails")
    .select(
      "id,idempotency_key,status,locked_until,attempts,payload,first_attempt_at",
    )
    .eq("stripe_subscription_id", input.stripeSubscriptionId)
    .eq("template_key", input.templateKey)
    .single();

  if (selectError) throw selectError;
  const claim = existing as WelcomeClaim | null;
  if (!claim || claim.status === "sent" || claim.status === "manual_review")
    return null;
  if (!claim.payload && (claim.attempts || 0) > 0) {
    await markWelcomeEmail(claim.id, {
      status: "manual_review",
      locked_until: null,
      last_error: "Historical attempt has no archived payload",
    });
    throw new Error(
      "Historical welcome attempt has no archived payload; reconcile provider before retry",
    );
  }
  if (
    (claim.attempts || 0) > 0 &&
    (!claim.first_attempt_at ||
      Date.now() - Date.parse(claim.first_attempt_at) > 23 * 60 * 60_000)
  ) {
    await markWelcomeEmail(claim.id, {
      status: "manual_review",
      locked_until: null,
      last_error:
        "Provider reconciliation required before retry outside idempotency window",
    });
    throw new Error(
      "Welcome idempotency window expired; reconcile provider before retry",
    );
  }

  if (
    claim.status === "sending" &&
    claim.locked_until &&
    claim.locked_until > nowIso
  ) {
    return null;
  }

  const { data: reserved, error: reserveError } = await supabase
    .from("subscription_welcome_emails")
    .update({
      status: "sending",
      attempts: (claim.attempts || 0) + 1,
      locked_until: lockedUntil,
      next_attempt_at: null,
      last_error: null,
      updated_at: nowIso,
      ...(!claim.payload
        ? {
            payload: input.payload,
            payload_sha256: billingEvidenceHash(input.payload),
            content_version: "paid-welcome/2026-10-28",
            first_attempt_at: nowIso,
          }
        : {}),
    })
    .eq("id", claim.id)
    .neq("status", "sent")
    .or(`locked_until.is.null,locked_until.lte.${nowIso}`)
    .select("id,idempotency_key,payload")
    .single();

  if (reserveError?.code && reserveError.code !== "PGRST116") {
    throw reserveError;
  }
  if (!reserved) return null;
  if (input.renewalStopped && (claim.attempts || 0) > 0) {
    await markWelcomeEmail(claim.id, {
      status: "manual_review",
      locked_until: null,
      next_attempt_at: null,
      last_error: "Cancellation requires welcome reconciliation before retry",
    });
    throw new Error(
      "Cancellation requires welcome reconciliation before retry",
    );
  }
  return {
    ...reserved,
    payload: claim.payload || input.payload,
  } as WelcomeClaim;
}

export async function sendSubscriptionWelcomeEmailOnce(input: SendInput) {
  const tier = normalizeTier(input.tier);
  if (!tier) return { status: "skipped" as const };

  const templateKey = WELCOME_TEMPLATE_BY_TIER[tier];
  if (!TEMPLATES[templateKey]) {
    return { status: "failed" as const, error: "Missing welcome template" };
  }

  const template = getPaidWelcomeTemplate(tier, {
    billing: input.billing,
    isLegacyPlan: input.isLegacyPlan,
    limits: input.limits,
    isCustomPlan: input.isCustomPlan,
  });

  const idempotencyKey = `subscription-welcome/${input.stripeSubscriptionId}/${templateKey}`;
  const claim = await reserveWelcomeEmailClaim({
    profileId: input.profileId,
    email: input.email,
    tier,
    templateKey,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    idempotencyKey,
    renewalStopped: input.billing?.renewalStopped,
    payload: {
      from: BRAND.from,
      to: [input.email],
      reply_to: BRAND.supportEmail,
      subject: template.subject,
      html: wrapDirectReplyLayout(template.body, template.preheader),
      ...(template.attachments ? { attachments: template.attachments } : {}),
    },
  });
  if (!claim) return { status: "skipped" as const };

  let acceptedEmailId: string | null = null;
  try {
    const result = await resend.emails.send(claim.payload!, {
      idempotencyKey: claim.idempotency_key,
    });

    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend returned no message ID");
    }

    const resendEmailId = result.data?.id || null;
    acceptedEmailId = resendEmailId;
    await markWelcomeEmail(claim.id, {
      status: "sent",
      resend_email_id: resendEmailId,
      sent_at: new Date().toISOString(),
      locked_until: null,
      last_error: null,
      next_attempt_at: null,
    });

    try {
      await ApiLogger.logRequest({
        userId: input.profileId,
        userEmail: input.email,
        endpoint: "/event/subscription_welcome_email_sent",
        requestMethod: "POST",
        userAgent: "stripe-webhook",
        responseStatus: 204,
        subscriptionTier: tier,
        subscriptionStatus: "active",
        fullRequestBody: {
          event: "subscription_welcome_email_sent",
          source: "stripe_webhook",
          page: "stripe",
          plan: tier,
          context: {
            templateKey,
            stripeSubscriptionId: input.stripeSubscriptionId,
            stripeCheckoutSessionId: input.stripeCheckoutSessionId || null,
            resendEmailId,
            idempotencyKey: claim.idempotency_key,
          },
        },
      });
    } catch (logError) {
      console.error("Welcome accepted; secondary event log failed", logError);
    }

    return { status: "sent" as const, resendEmailId: resendEmailId || "" };
  } catch (sendError) {
    const message = getErrorMessage(sendError);
    await markWelcomeEmail(claim.id, {
      status: acceptedEmailId ? "manual_review" : "failed",
      ...(acceptedEmailId ? { resend_email_id: acceptedEmailId } : {}),
      locked_until: null,
      last_error: message,
      next_attempt_at: nextAttemptIso(),
    });

    console.error("Failed to send subscription welcome email:", message);
    return { status: "failed" as const, error: message };
  }
}
