import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { supabase } from "../../utils/supabaseClient";
import { createPricingOfferUrl } from "../../utils/pricingOfferToken";
import {
  LIMIT_FOLLOWUP_COUPON_CODE,
  findLimitFollowupRecipients,
  getAllLimitFollowupExclusions,
} from "../../utils/limitFollowupEligibility";

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(incomingOrigin)) return callback(null, true);
    if (vintedOriginPattern.test(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for limit follow-up offer"), false);
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Authorization", "X-Autolister-Extension-Version"],
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

  const exclusions = await getAllLimitFollowupExclusions([]);
  const recipients = await findLimitFollowupRecipients({
    sinceHours: 168,
    minDelayMinutes: 30,
    excludedEmails: exclusions.excludedEmails,
    excludedUserIds: exclusions.excludedUserIds,
    userId: user.id,
    requireExplicitLimitHit: true,
  });
  const recipient = recipients[0];

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
