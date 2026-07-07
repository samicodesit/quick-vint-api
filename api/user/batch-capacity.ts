import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { RateLimiter, type UserProfile } from "../../utils/rateLimiter";
import { supabase } from "../../utils/supabaseClient";
import { getPricingLimitsModeForExtension } from "../../utils/tierConfig";
import {
  buildAccountPausedResponse,
  isAccountPaused,
} from "../../src/utils/accountPause";

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
    return callback(new Error("CORS origin denied for batch capacity"), false);
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
      error: corsError.message || "CORS check failed for batch capacity",
    });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed" });
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "api_calls_this_month, subscription_status, subscription_tier, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, account_status, abuse_reason",
    )
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    return res.status(500).json({ error: "Could not retrieve profile." });
  }

  const userProfile: UserProfile = {
    api_calls_this_month: Number(profile?.api_calls_this_month || 0),
    subscription_status: profile?.subscription_status || "free",
    subscription_tier: profile?.subscription_tier || "free",
    is_legacy_plan: Boolean(profile?.is_legacy_plan),
    free_lifetime_generations_used: Number(
      profile?.free_lifetime_generations_used || 0,
    ),
    pack_credits: Number(profile?.pack_credits || 0),
    custom_daily_limit:
      typeof profile?.custom_daily_limit === "number"
        ? profile.custom_daily_limit
        : null,
    custom_monthly_limit:
      typeof profile?.custom_monthly_limit === "number"
        ? profile.custom_monthly_limit
        : null,
    custom_limit_expires_at: profile?.custom_limit_expires_at || null,
  };
  const extensionVersionHeader = req.headers["x-autolister-extension-version"];
  const extensionVersion = Array.isArray(extensionVersionHeader)
    ? extensionVersionHeader[0]
    : extensionVersionHeader;
  const pricingLimitsMode = getPricingLimitsModeForExtension(extensionVersion);

  if (isAccountPaused(profile)) {
    return res.status(200).json({
      ...buildAccountPausedResponse(profile),
      tier: "free",
      nextTier: null,
      limits: {
        daily: null,
        monthly: 0,
        burstPerMinute: 0,
      },
      remaining: {
        day: null,
        month: 0,
        packCredits: 0,
      },
      pricingLimitsMode,
    });
  }

  const capacity = await RateLimiter.getGenerationCapacity(
    user.id,
    userProfile,
    pricingLimitsMode,
  );

  return res.status(200).json({
    ...capacity,
    pricingLimitsMode,
  });
}
