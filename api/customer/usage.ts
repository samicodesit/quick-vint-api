import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyCustomerUsageToken } from "../../utils/customerUsageToken";
import { RateLimiter, type UserProfile } from "../../utils/rateLimiter";
import { supabase } from "../../utils/supabaseClient";
import {
  getCustomBusinessEntitlementDefaults,
  getEffectiveTier,
} from "../../utils/tierConfig";

function positiveNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hasActiveCustomLimits(profile: {
  custom_limit_expires_at?: string | null;
}) {
  return Boolean(
    profile.custom_limit_expires_at &&
    new Date(profile.custom_limit_expires_at) > new Date(),
  );
}

function percentage(used: number, total: number | null) {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((used / total) * 100));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    return res.status(400).json({ error: "Missing usage token." });
  }

  try {
    const usageLink = verifyCustomerUsageToken(token);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, api_calls_this_month, subscription_status, subscription_tier, current_period_end, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, custom_limit_reason",
      )
      .ilike("email", usageLink.email)
      .single();

    if (profileError || !profile?.id) {
      return res.status(404).json({ error: "Usage account was not found." });
    }

    const userProfile: UserProfile = {
      api_calls_this_month: positiveNumber(profile.api_calls_this_month),
      subscription_status: profile.subscription_status || "free",
      subscription_tier: profile.subscription_tier || "free",
      is_legacy_plan: Boolean(profile.is_legacy_plan),
      free_lifetime_generations_used: positiveNumber(
        profile.free_lifetime_generations_used,
      ),
      pack_credits: positiveNumber(profile.pack_credits),
      custom_daily_limit:
        typeof profile.custom_daily_limit === "number"
          ? profile.custom_daily_limit
          : null,
      custom_monthly_limit:
        typeof profile.custom_monthly_limit === "number"
          ? profile.custom_monthly_limit
          : null,
      custom_limit_expires_at: profile.custom_limit_expires_at || null,
    };

    const capacity = await RateLimiter.getGenerationCapacity(
      profile.id,
      userProfile,
      "current",
    );
    const { data: dayLimit } = await supabase
      .from("rate_limits")
      .select("count")
      .eq("user_id", profile.id)
      .eq("window_type", "day")
      .gte("expires_at", new Date().toISOString())
      .order("count", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dailyUsed = positiveNumber(dayLimit?.count);
    const monthlyUsed = positiveNumber(profile.api_calls_this_month);
    const dailyLimit = capacity.limits.daily;
    const monthlyLimit = capacity.limits.monthly;
    const customActive = hasActiveCustomLimits(profile);
    const tier = getEffectiveTier(profile);
    const offer = getCustomBusinessEntitlementDefaults();

    return res.status(200).json({
      customer: {
        email: profile.email,
      },
      setup: {
        label: customActive ? "Custom Business setup" : "Pending activation",
        status: customActive ? "active" : "pending",
        tier,
        customActive,
        offer: {
          label: offer.reason,
          monthlyPriceEur: offer.monthlyPriceEur,
          dailyLimit: offer.dailyLimit,
          monthlyLimit: offer.monthlyLimit,
        },
        currentPeriodEnd: profile.current_period_end || null,
        customLimitExpiresAt: profile.custom_limit_expires_at || null,
        customLimitReason: profile.custom_limit_reason || null,
      },
      usage: {
        daily: {
          used: dailyUsed,
          limit: dailyLimit,
          remaining: capacity.remaining.day,
          percent: percentage(dailyUsed, dailyLimit),
        },
        monthly: {
          used: monthlyUsed,
          limit: monthlyLimit,
          remaining: capacity.remaining.month,
          percent: percentage(monthlyUsed, monthlyLimit),
        },
        packCredits: capacity.remaining.packCredits,
        availableNow: capacity.available,
        allowed: capacity.allowed,
        reason: capacity.reason || null,
        message: capacity.message || null,
      },
      note: {
        extensionDisplayMayLag: customActive,
      },
      generatedAt: new Date().toISOString(),
      linkExpiresAt: usageLink.expiresAt,
    });
  } catch (error: any) {
    const message = String(error?.message || "Invalid usage token.");
    const status = message.includes("expired") ? 410 : 400;
    return res.status(status).json({ error: message });
  }
}
