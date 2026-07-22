import { Resend } from "resend";
import { ApiLogger } from "./apiLogger";
import { BRAND, TEMPLATES, wrapDirectReplyLayout } from "./emailTemplates";
import { supabase } from "./supabaseClient";

type PaidTier = "starter" | "pro" | "business";

type WelcomeClaim = {
  id: string;
  idempotency_key: string;
  status?: string;
  locked_until?: string | null;
  attempts?: number | null;
};

type SendInput = {
  profileId: string;
  email: string;
  tier: string;
  stripeSubscriptionId: string;
  stripeCheckoutSessionId?: string | null;
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
    console.error("Failed to update subscription welcome email:", error);
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
      status: "sending",
      attempts: 1,
      locked_until: lockedUntil,
      next_attempt_at: null,
    })
    .select("id,idempotency_key")
    .single();

  if (inserted) return inserted as WelcomeClaim;
  if (!insertError) {
    throw new Error("Failed to reserve subscription welcome email");
  }
  if (insertError.code !== "23505") throw insertError;

  const { data: existing, error: selectError } = await supabase
    .from("subscription_welcome_emails")
    .select("id,idempotency_key,status,locked_until,attempts")
    .eq("stripe_subscription_id", input.stripeSubscriptionId)
    .eq("template_key", input.templateKey)
    .single();

  if (selectError) throw selectError;
  const claim = existing as WelcomeClaim | null;
  if (!claim || claim.status === "sent") return null;

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
    })
    .eq("id", claim.id)
    .neq("status", "sent")
    .or(`locked_until.is.null,locked_until.lte.${nowIso}`)
    .select("id,idempotency_key")
    .single();

  if (reserveError?.code && reserveError.code !== "PGRST116") {
    throw reserveError;
  }
  if (!reserved) return null;
  return reserved as WelcomeClaim;
}

export async function sendSubscriptionWelcomeEmailOnce(input: SendInput) {
  const tier = normalizeTier(input.tier);
  if (!tier) return { status: "skipped" as const };

  const templateKey = WELCOME_TEMPLATE_BY_TIER[tier];
  const template = TEMPLATES[templateKey];
  if (!template) {
    return { status: "failed" as const, error: "Missing welcome template" };
  }

  const idempotencyKey = `subscription-welcome/${input.stripeSubscriptionId}/${templateKey}`;
  const claim = await reserveWelcomeEmailClaim({
    profileId: input.profileId,
    email: input.email,
    tier,
    templateKey,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    idempotencyKey,
  });
  if (!claim) return { status: "skipped" as const };

  try {
    const result = await resend.emails.send(
      {
        from: BRAND.from,
        to: [input.email],
        subject: template.subject,
        html: wrapDirectReplyLayout(template.body, template.preheader),
      },
      { idempotencyKey: claim.idempotency_key },
    );

    if (result.error) {
      throw new Error(result.error.message || "Resend email failed");
    }

    const resendEmailId = result.data?.id || null;
    await markWelcomeEmail(claim.id, {
      status: "sent",
      resend_email_id: resendEmailId,
      sent_at: new Date().toISOString(),
      locked_until: null,
      last_error: null,
      next_attempt_at: null,
    });

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

    return { status: "sent" as const, resendEmailId: resendEmailId || "" };
  } catch (sendError) {
    const message = getErrorMessage(sendError);
    await markWelcomeEmail(claim.id, {
      status: "failed",
      locked_until: null,
      last_error: message,
      next_attempt_at: nextAttemptIso(),
    });

    console.error("Failed to send subscription welcome email:", message);
    return { status: "failed" as const, error: message };
  }
}
