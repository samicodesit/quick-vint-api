import {
  LIMIT_FOLLOWUP_COUPON_CODE,
  normalizeEmailForCampaign,
} from "./limitFollowupEligibility";
import { createPricingOfferToken } from "./pricingOfferToken";
import { supabase } from "./supabaseClient";
import { FREE_LIFETIME_LIMIT } from "./tierConfig";
import { hasPaidEntitlementStatus } from "../src/utils/subscriptionStatus";

const OFFER_WINDOW_MS = 72 * 60 * 60 * 1000;

export async function getDraftFiveOffer(user: { id: string; email?: string }) {
  const email = normalizeEmailForCampaign(user.email);
  if (
    process.env.DRAFT_FIVE_OFFER_ENABLED !== "true" ||
    !email ||
    email === "vgourlain@hotmail.com"
  )
    return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "account_status, subscription_status, subscription_tier, pack_credits, free_lifetime_generations_used",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (
    !profile ||
    (profile.account_status && profile.account_status !== "active") ||
    hasPaidEntitlementStatus(profile.subscription_status) ||
    (profile.subscription_tier && profile.subscription_tier !== "free") ||
    Number(profile.pack_credits) > 0 ||
    Number(profile.free_lifetime_generations_used) < FREE_LIFETIME_LIMIT
  )
    return null;

  const { data: drafts, error: draftError } = await supabase
    .from("generation_reservations")
    .select("committed_at")
    .eq("user_id", user.id)
    .eq("status", "committed")
    .eq("entitlement_type", "free_lifetime")
    .order("committed_at", { ascending: true, nullsFirst: false })
    .limit(FREE_LIFETIME_LIMIT);
  if (draftError) throw draftError;
  const fifth = Date.parse(
    drafts?.[FREE_LIFETIME_LIMIT - 1]?.committed_at || "",
  );
  if (
    !Number.isFinite(fifth) ||
    fifth > Date.now() ||
    fifth + OFFER_WINDOW_MS <= Date.now()
  )
    return null;

  const [invoices, packs] = await Promise.all([
    supabase
      .from("billing_events")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_type", "invoice.payment_succeeded")
      .eq("status", "paid")
      .gt("amount_due", 0)
      .limit(1),
    supabase
      .from("credit_ledger")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "purchase")
      .gt("delta", 0)
      .like("stripe_session_id", "cs_live_%")
      .limit(1),
  ]);
  if (invoices.error || packs.error) throw invoices.error || packs.error;
  if (invoices.data?.length || packs.data?.length) return null;

  const expiresAt = new Date(fifth + OFFER_WINDOW_MS).toISOString();
  return {
    expiresAt,
    offerToken: createPricingOfferToken({
      email,
      targetTier: "pro",
      couponCode: LIMIT_FOLLOWUP_COUPON_CODE,
      expiresAt,
    }),
  };
}
