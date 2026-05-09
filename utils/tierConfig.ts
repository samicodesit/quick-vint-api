export interface TierConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  stripe: {
    productId: string;
    priceId: string;
  };
  // Legacy tiers use count-based limits; new tiers use credits.
  limits?: {
    daily: number;
    monthly: number;
    burst: { perMinute: number };
  };
  credits?: {
    monthly: number;
    rolloverCap: number;
  };
  features: string[];
}

export interface PackConfig {
  id: "pack";
  credits: number;
  price: number;
  stripe: { productId: string; priceId: string };
}

export interface FeatureFlags {
  tone_control: boolean;
  emoji: boolean;
  multi_lang: boolean;
  listing_preferences: boolean;
  smart_regen: boolean;
  completeness_suggestions: boolean;
  priority_processing: boolean;
  /** null = unlimited; number = max per month */
  phone_upload_limit: number | null;
}

// ─── Legacy tiers (existing 12 subscribers — DO NOT CHANGE) ──────────────────
// These use the old daily/monthly rate-limiting system.

export const LEGACY_TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    id: "free",
    name: "free",
    displayName: "Free Trial",
    description: "Get a taste of AutoLister AI",
    monthlyPrice: 0,
    stripe: {
      productId: "prod_T5HLolJrCnS2x6",
      priceId: "price_1S96mcP5rNq9hGDSGMayEHQ1",
    },
    limits: {
      daily: 2,
      monthly: 8,
      burst: { perMinute: 3 },
    },
    features: ["AI-generated titles and descriptions", "Basic support"],
  },

  starter: {
    id: "starter",
    name: "starter",
    displayName: "Starter",
    description: "Perfect for casual Vinted sellers",
    monthlyPrice: 3.99,
    stripe: {
      productId: "prod_T5HLgwjVpMBXzZ",
      priceId: "price_1S96n6P5rNq9hGDSjEHrJV5g",
    },
    limits: {
      daily: 15,
      monthly: 300,
      burst: { perMinute: 10 },
    },
    features: [
      "AI-generated titles and descriptions",
      "Priority support",
      "Up to 15 listings per day",
    ],
  },

  pro: {
    id: "pro",
    name: "pro",
    displayName: "Pro",
    description: "For active sellers listing daily",
    monthlyPrice: 9.99,
    stripe: {
      productId: "prod_T5HMxldgRIjyyn",
      priceId: "price_1S96o0P5rNq9hGDStClke9za",
    },
    limits: {
      daily: 40,
      monthly: 800,
      burst: { perMinute: 20 },
    },
    features: [
      "Everything in Starter",
      "Up to 40 listings per day",
      "Priority processing",
    ],
  },

  business: {
    id: "business",
    name: "business",
    displayName: "Business",
    description: "For resellers and high-volume sellers",
    monthlyPrice: 19.99,
    stripe: {
      productId: "prod_T5HM9khIl1EvUA",
      priceId: "price_1S96oFP5rNq9hGDSPZ1RpKHJ",
    },
    // Legacy Business is unlimited daily; only the monthly cap (1,500) applies.
    limits: {
      daily: Number.MAX_SAFE_INTEGER,
      monthly: 1500,
      burst: { perMinute: 30 },
    },
    features: [
      "Everything in Pro",
      "Unlimited daily listings",
      "Dedicated support",
    ],
  },
};

// ─── New credit-based tiers ───────────────────────────────────────────────────
// Stripe product/price IDs come from env vars so they can differ between
// staging and production without redeploying.

const env = (key: string): string => process.env[key] ?? "";

export const NEW_TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    id: "free",
    name: "free",
    displayName: "Free",
    description: "13 total credits — no card required",
    monthlyPrice: 0,
    stripe: { productId: "", priceId: "" },
    credits: { monthly: 0, rolloverCap: 0 },
    features: ["AI-generated titles and descriptions", "5 phone uploads/month"],
  },

  starter_v2: {
    id: "starter_v2",
    name: "starter_v2",
    displayName: "Starter",
    description: "For casual Vinted sellers",
    monthlyPrice: 5.99,
    stripe: {
      productId: env("STRIPE_STARTER_V2_PRODUCT_ID"),
      priceId: env("STRIPE_STARTER_V2_PRICE_ID"),
    },
    credits: { monthly: 80, rolloverCap: 240 },
    features: [
      "80 credits/month",
      "Rollover up to 240",
      "Unlimited phone uploads",
    ],
  },

  plus: {
    id: "plus",
    name: "plus",
    displayName: "Plus",
    description: "For regular sellers",
    monthlyPrice: 9.99,
    stripe: {
      productId: env("STRIPE_PLUS_PRODUCT_ID"),
      priceId: env("STRIPE_PLUS_PRICE_ID"),
    },
    credits: { monthly: 200, rolloverCap: 600 },
    features: [
      "200 credits/month",
      "Rollover up to 600",
      "Listing Preferences",
      "Smart Re-Gen",
    ],
  },

  pro_v2: {
    id: "pro_v2",
    name: "pro_v2",
    displayName: "Pro",
    description: "For active sellers",
    monthlyPrice: 14.99,
    stripe: {
      productId: env("STRIPE_PRO_V2_PRODUCT_ID"),
      priceId: env("STRIPE_PRO_V2_PRICE_ID"),
    },
    credits: { monthly: 400, rolloverCap: 1200 },
    features: [
      "400 credits/month",
      "Rollover up to 1,200",
      "Tone Control",
      "Emoji support",
      "Multi-language batch",
      "Completeness suggestions",
    ],
  },

  business_v2: {
    id: "business_v2",
    name: "business_v2",
    displayName: "Business",
    description: "For Vinted Pro sellers",
    monthlyPrice: 24.99,
    stripe: {
      productId: env("STRIPE_BUSINESS_V2_PRODUCT_ID"),
      priceId: env("STRIPE_BUSINESS_V2_PRICE_ID"),
    },
    credits: { monthly: 1000, rolloverCap: 3000 },
    features: [
      "1,000 credits/month",
      "Rollover up to 3,000",
      "Priority processing",
      "Dedicated support",
    ],
  },
};

// Closet Clear Pack — one-time purchase, 15 permanent credits
export const PACK_CONFIG: PackConfig = {
  id: "pack",
  credits: 15,
  price: 3.99,
  stripe: {
    productId: env("STRIPE_PACK_PRODUCT_ID"),
    priceId: env("STRIPE_PACK_PRICE_ID"),
  },
};

// All configs combined for lookup helpers
export const TIER_CONFIGS: Record<string, TierConfig> = {
  ...LEGACY_TIER_CONFIGS,
  ...NEW_TIER_CONFIGS,
};

// IDs of tiers that use the legacy daily/monthly rate-limiter
export const LEGACY_TIER_IDS = new Set(["starter", "pro", "business"]);

export function isLegacyTierById(tierId: string): boolean {
  return LEGACY_TIER_IDS.has(tierId);
}

// ─── Stripe lookup helpers ────────────────────────────────────────────────────

export function getTierByStripeProductId(productId: string): TierConfig | null {
  if (!productId) return null;
  for (const config of Object.values(TIER_CONFIGS)) {
    if (config.stripe.productId && config.stripe.productId === productId) {
      return config;
    }
  }
  return null;
}

export function getTierByStripePriceId(priceId: string): TierConfig | null {
  if (!priceId) return null;
  for (const config of Object.values(TIER_CONFIGS)) {
    if (config.stripe.priceId && config.stripe.priceId === priceId) {
      return config;
    }
  }
  return null;
}

export function getAllPaidTiers(): TierConfig[] {
  return Object.values(TIER_CONFIGS).filter((t) => t.monthlyPrice > 0);
}

// ─── Feature flags ────────────────────────────────────────────────────────────

export function getFeatureFlags(tier: string, isLegacy: boolean): FeatureFlags {
  if (isLegacy) {
    // Legacy subscribers: replicate original behaviour exactly
    const isPro = tier === "pro" || tier === "business";
    return {
      tone_control: isPro,
      emoji: isPro,
      multi_lang: false,
      listing_preferences: false,
      smart_regen: false,
      completeness_suggestions: false,
      priority_processing: tier === "business",
      phone_upload_limit: null,
    };
  }

  switch (tier) {
    case "business_v2":
      return {
        tone_control: true,
        emoji: true,
        multi_lang: true,
        listing_preferences: true,
        smart_regen: true,
        completeness_suggestions: true,
        priority_processing: true,
        phone_upload_limit: null,
      };
    case "pro_v2":
      return {
        tone_control: true,
        emoji: true,
        multi_lang: true,
        listing_preferences: true,
        smart_regen: true,
        completeness_suggestions: true,
        priority_processing: false,
        phone_upload_limit: null,
      };
    case "plus":
      return {
        tone_control: false,
        emoji: false,
        multi_lang: false,
        listing_preferences: true,
        smart_regen: true,
        completeness_suggestions: false,
        priority_processing: false,
        phone_upload_limit: null,
      };
    case "starter_v2":
      return {
        tone_control: false,
        emoji: false,
        multi_lang: false,
        listing_preferences: false,
        smart_regen: false,
        completeness_suggestions: false,
        priority_processing: false,
        phone_upload_limit: null,
      };
    default: // free
      return {
        tone_control: false,
        emoji: false,
        multi_lang: false,
        listing_preferences: false,
        smart_regen: false,
        completeness_suggestions: false,
        priority_processing: false,
        phone_upload_limit: 5,
      };
  }
}
