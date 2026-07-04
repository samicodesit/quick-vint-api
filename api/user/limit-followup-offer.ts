import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { supabase } from "../../utils/supabaseClient";
import { createPricingOfferUrl } from "../../utils/pricingOfferToken";
import {
  LIMIT_FOLLOWUP_COUPON_CODE,
  findLimitFollowupRecipients,
  getAllLimitFollowupExclusions,
  normalizeEmailForCampaign,
} from "../../utils/limitFollowupEligibility";
import { FREE_LIFETIME_LIMIT } from "../../utils/tierConfig";

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/;
const chromeExtensionOriginPattern = /^chrome-extension:\/\/[a-p]{32}$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const INTERNAL_OFFER_TEST_EMAILS = new Set(["samicodesit@gmail.com"]);

export function isAllowedLimitFollowupOrigin(incomingOrigin?: string | null) {
  if (!incomingOrigin) return true;
  if (ALLOWED_ORIGINS.includes(incomingOrigin)) return true;
  if (vintedOriginPattern.test(incomingOrigin)) return true;
  if (chromeExtensionOriginPattern.test(incomingOrigin)) return true;
  return false;
}

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (isAllowedLimitFollowupOrigin(incomingOrigin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin denied for limit follow-up offer"), false);
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Autolister-Extension-Version"],
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await runCors(req, res);
  } catch (corsError: any) {
    return res.status(403).json({
      error: corsError.message || "CORS check failed for limit follow-up offer",
    });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }

  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const normalizedUserEmail = normalizeEmailForCampaign(user.email);
  const isInternalOfferTester =
    normalizedUserEmail && INTERNAL_OFFER_TEST_EMAILS.has(normalizedUserEmail);
  const exclusions = await getAllLimitFollowupExclusions([]);
  if (isInternalOfferTester) {
    exclusions.excludedEmails.delete(normalizedUserEmail);
    exclusions.excludedUserIds.delete(user.id);
  }
  const recipients = await findLimitFollowupRecipients({
    sinceHours: 168,
    minDelayMinutes: 0,
    excludedEmails: exclusions.excludedEmails,
    excludedUserIds: exclusions.excludedUserIds,
    userId: user.id,
    requireExplicitLimitHit: true,
  });
  let recipient = recipients[0];

  if (!recipient && isInternalOfferTester) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, subscription_status, subscription_tier, email_subscribed, unsubscribe_token, free_lifetime_generations_used, pack_credits",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return res.status(500).json({ error: "Failed to check tester profile" });
    }

    const isFree =
      profile &&
      (!profile.subscription_status ||
        profile.subscription_status !== "active" ||
        !profile.subscription_tier ||
        profile.subscription_tier === "free");
    const hasReachedFreeLimit =
      Number(profile?.free_lifetime_generations_used || 0) >= FREE_LIFETIME_LIMIT;
    const hasAvailableCredits = Number(profile?.pack_credits || 0) > 0;

    if (
      profile?.email &&
      profile?.unsubscribe_token &&
      profile.email_subscribed &&
      isFree &&
      hasReachedFreeLimit &&
      !hasAvailableCredits
    ) {
      recipient = {
        id: profile.id,
        email: profile.email,
        unsubscribe_token: profile.unsubscribe_token,
        limitHitAt: new Date().toISOString(),
      };
    }
  }

  if (!recipient) {
    return res.status(200).json({ eligible: false });
  }

  const pricingUrl = createPricingOfferUrl(
    {
      email: recipient.email,
      targetTier: "pro",
      couponCode: LIMIT_FOLLOWUP_COUPON_CODE,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    undefined,
    { utmCampaign: "limit_followup_offer_ui" },
  );

  return res.status(200).json({
    eligible: true,
    campaignKey: "limit_followup_offer_v1",
    couponCode: LIMIT_FOLLOWUP_COUPON_CODE,
    discountLabel: "20% off your first month",
    title: "Keep listing without waiting",
    body: "You reached the free limit. Upgrade when you're ready and keep your next listings moving today.",
    trust: "No Vinted account connection needed.",
    cta: "View upgrade options",
    pricingUrl,
    limitHitAt: recipient.limitHitAt,
  });
}
