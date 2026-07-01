import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyPricingOfferToken } from "../../utils/pricingOfferToken";
import { supabase } from "../../utils/supabaseClient";
import { normalizeTier } from "../../utils/tierConfig";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    return res.status(400).json({ error: "Missing offer token." });
  }

  try {
    const offer = verifyPricingOfferToken(token);
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, email, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id",
      )
      .ilike("email", offer.email)
      .single();

    if (error || !profile?.email) {
      return res.status(404).json({ error: "Offer user was not found." });
    }

    return res.status(200).json({
      user: {
        id: profile.id,
        email: profile.email,
      },
      profile: {
        subscription_tier: normalizeTier(profile.subscription_tier),
        subscription_status: profile.subscription_status || "free",
      },
      offer: {
        targetTier: offer.targetTier,
        couponCode: offer.couponCode || "",
        expiresAt: offer.expiresAt,
        canManageSubscription: Boolean(
          profile.stripe_customer_id && profile.stripe_subscription_id,
        ),
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "Invalid offer token.");
    const status = message.includes("expired") ? 410 : 400;
    return res.status(status).json({ error: message });
  }
}
