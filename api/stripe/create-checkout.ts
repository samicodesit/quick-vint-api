import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { TIER_CONFIGS } from "../../utils/tierConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;

type NewTierId = "starter_v2" | "plus" | "pro_v2" | "business_v2";
type LegacyCheckoutTierId = "starter" | "pro" | "business";
type CheckoutTierId = NewTierId | LegacyCheckoutTierId;

const VALID_TIERS = new Set<NewTierId>([
  "starter_v2",
  "plus",
  "pro_v2",
  "business_v2",
]);

const LEGACY_CHECKOUT_TIERS = new Set<LegacyCheckoutTierId>([
  "starter",
  "pro",
  "business",
]);

function normalizeCheckoutTier(tier: CheckoutTierId): CheckoutTierId | null {
  if (VALID_TIERS.has(tier as NewTierId)) return tier as NewTierId;
  if (LEGACY_CHECKOUT_TIERS.has(tier as LegacyCheckoutTierId)) {
    return tier as LegacyCheckoutTierId;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email, tier } = req.body as { email: string; tier: CheckoutTierId };
    const normalizedEmail = typeof email === "string" ? email.trim() : "";

    if (
      !normalizedEmail ||
      typeof normalizedEmail !== "string" ||
      !normalizedEmail.includes("@")
    ) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    const normalizedTier = normalizeCheckoutTier(tier);

    if (!normalizedTier) {
      return res.status(400).json({
        error:
          "Invalid tier. Must be one of: starter_v2, plus, pro_v2, business_v2.",
      });
    }

    const tierConfig = TIER_CONFIGS[normalizedTier];
    const priceId = tierConfig.stripe.priceId;

    if (!priceId || priceId.includes("PLACEHOLDER")) {
      console.error(
        `Stripe price ID not configured for tier: ${normalizedTier}`,
      );
      return res.status(500).json({ error: "Subscription not available yet." });
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: normalizedEmail,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CANCEL_URL}?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      metadata: { tier: normalizedTier },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("❌ create-checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
