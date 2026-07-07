// New tier configuration system - database driven for easy updates
export interface TierConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  // Add Stripe IDs for separate products approach
  stripe: {
    productId: string;
    priceId: string;
  };
  limits: {
    daily: number;
    monthly: number;
    burst: {
      perMinute: number;
    };
  };
  features: string[];
}

export const FREE_LIFETIME_LIMIT = 5;

export const CREDIT_PACK_CONFIG = {
  id: "credits_20",
  credits: 20,
  priceEur: 5.99,
  displayName: "20 credits",
} as const;

export type TierKey = "free" | "starter" | "pro" | "business";
export type PricingLimitsMode = "legacy" | "current";
export const CURRENT_LIMITS_MIN_EXTENSION_VERSION = "1.3.13";

export type EntitlementProfile = {
  subscription_status?: string | null;
  subscription_tier?: string | null;
  is_legacy_plan?: boolean | null;
};

export type CustomBusinessEntitlement = {
  tier: "business";
  monthlyPriceEur: number;
  dailyLimit: number;
  monthlyLimit: number;
  reason: string;
};

export function normalizeTier(tier?: string | null): TierKey {
  const map: Record<string, TierKey> = {
    unlimited_monthly: "starter",
    unlimited_annual: "starter",
    starter: "starter",
    pro: "pro",
    business: "business",
    free: "free",
  };

  return map[String(tier || "free")] || "free";
}

export function getEffectiveTier(profile: EntitlementProfile): TierKey {
  return profile.subscription_status === "active"
    ? normalizeTier(profile.subscription_tier)
    : "free";
}

export function getNextTier(tier: TierKey): TierKey | null {
  const nextTierByTier: Record<TierKey, TierKey | null> = {
    free: "starter",
    starter: "pro",
    pro: "business",
    business: null,
  };

  return nextTierByTier[tier];
}

export function getPricingLimitsMode(): PricingLimitsMode {
  return process.env.PRICING_LIMITS_MODE === "legacy" ? "legacy" : "current";
}

export function compareSemver(a: string, b: string): number {
  const aParts = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const aPart = aParts[index] || 0;
    const bPart = bParts[index] || 0;
    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  return 0;
}

export function getPricingLimitsModeForExtension(
  extensionVersion?: string | null,
): PricingLimitsMode {
  const globalMode = getPricingLimitsMode();
  if (globalMode === "current") return "current";

  if (
    extensionVersion &&
    compareSemver(extensionVersion, CURRENT_LIMITS_MIN_EXTENSION_VERSION) >= 0
  ) {
    return "current";
  }

  return "legacy";
}

// Current limits apply to new subscriptions and users who switch plans.
export const TIER_CONFIGS: Record<TierKey, TierConfig> = {
  free: {
    id: "free",
    name: "free",
    displayName: "Free Trial",
    description: "Try AutoLister AI with 5 lifetime listings",
    monthlyPrice: 0,
    stripe: {
      productId: "prod_T5HLolJrCnS2x6", // Replace with actual Stripe product ID
      priceId: "price_1S96mcP5rNq9hGDSGMayEHQ1", // Replace with actual Stripe price ID
    },
    limits: {
      daily: FREE_LIFETIME_LIMIT,
      monthly: FREE_LIFETIME_LIMIT,
      burst: {
        perMinute: 3, // Allow a couple quick tries
      },
    },
    features: ["5 lifetime listings", "AI-generated titles and descriptions"],
  },

  starter: {
    id: "starter",
    name: "starter",
    displayName: "Starter",
    description: "For casual sellers",
    monthlyPrice: 3.99,
    stripe: {
      productId: "prod_T5HLgwjVpMBXzZ", // Replace with actual Stripe product ID
      priceId: "price_1S96n6P5rNq9hGDSjEHrJV5g", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 10,
      monthly: 75,
      burst: {
        perMinute: 10,
      },
    },
    features: [
      "AI-generated titles and descriptions",
      "Priority support",
      "Up to 10 listings per day",
    ],
  },

  pro: {
    id: "pro",
    name: "pro",
    displayName: "Pro",
    description: "For active sellers listing daily",
    monthlyPrice: 9.99,
    stripe: {
      productId: "prod_T5HMxldgRIjyyn", // Replace with actual Stripe product ID
      priceId: "price_1S96o0P5rNq9hGDStClke9za", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 25,
      monthly: 250,
      burst: {
        perMinute: 20,
      },
    },
    features: [
      "Everything in Starter",
      "Up to 25 listings per day",
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
      productId: "prod_T5HM9khIl1EvUA", // Replace with actual Stripe product ID
      priceId: "price_1S96oFP5rNq9hGDSPZ1RpKHJ", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 60,
      monthly: 600,
      burst: {
        perMinute: 30,
      },
    },
    features: [
      "Everything in Pro",
      "Up to 60 listings per day",
      "Dedicated support",
      "Highest daily limits",
    ],
  },
};

// Existing active paid subscribers at migration time keep these limits until
// they change tier or resubscribe after canceling.
export const LEGACY_TIER_CONFIGS: Record<TierKey, TierConfig> = {
  ...TIER_CONFIGS,
  starter: {
    ...TIER_CONFIGS.starter,
    limits: { daily: 15, monthly: 300, burst: { perMinute: 10 } },
    features: [
      "AI-generated titles and descriptions",
      "Priority support",
      "Up to 15 listings per day",
    ],
  },
  pro: {
    ...TIER_CONFIGS.pro,
    limits: { daily: 40, monthly: 800, burst: { perMinute: 20 } },
    features: [
      "Everything in Starter",
      "Up to 40 listings per day",
      "Priority processing",
    ],
  },
  business: {
    ...TIER_CONFIGS.business,
    limits: { daily: 75, monthly: 1500, burst: { perMinute: 30 } },
    features: [
      "Everything in Pro",
      "Up to 75 listings per day",
      "Dedicated support",
      "Highest daily limits",
    ],
  },
};

// Compatibility mode preserves the old public limits for explicit rollbacks.
// Active legacy subscribers still keep legacy paid limits in current mode.
export const COMPATIBILITY_TIER_CONFIGS: Record<TierKey, TierConfig> = {
  ...LEGACY_TIER_CONFIGS,
  free: {
    ...TIER_CONFIGS.free,
    description: "Get a taste of AutoLister AI",
    limits: {
      daily: 2,
      monthly: 8,
      burst: {
        perMinute: 3,
      },
    },
    features: ["AI-generated titles and descriptions", "Basic support"],
  },
};

export function getTierConfigForProfile(
  profile: EntitlementProfile,
  pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
): TierConfig {
  const tier = getEffectiveTier(profile);
  if (pricingLimitsMode === "legacy") {
    return COMPATIBILITY_TIER_CONFIGS[tier] || COMPATIBILITY_TIER_CONFIGS.free;
  }

  const source =
    profile.subscription_status === "active" && profile.is_legacy_plan
      ? LEGACY_TIER_CONFIGS
      : TIER_CONFIGS;

  return source[tier] || TIER_CONFIGS.free;
}

export function hasUnlimitedDailyLimit(
  profile: EntitlementProfile,
  pricingLimitsMode: PricingLimitsMode = getPricingLimitsMode(),
): boolean {
  const tier = getEffectiveTier(profile);
  if (tier !== "business") return false;

  return (
    pricingLimitsMode === "legacy" ||
    (profile.subscription_status === "active" &&
      Boolean(profile.is_legacy_plan))
  );
}

// Future expansion ready
export const ENTERPRISE_TIER = {
  // Custom pricing, dedicated infrastructure, SLA, etc.
};

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getPositiveNumberEnv(name: string, fallback: number): number {
  const value = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getCustomBusinessPriceIds(): string[] {
  return (process.env.STRIPE_CUSTOM_BUSINESS_PRICE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isCustomBusinessStripePriceId(
  priceId?: string | null,
): boolean {
  if (!priceId) return false;
  return getCustomBusinessPriceIds().includes(priceId);
}

export function getCustomBusinessEntitlementForStripePriceId(
  priceId?: string | null,
): CustomBusinessEntitlement | null {
  if (!isCustomBusinessStripePriceId(priceId)) return null;

  return getCustomBusinessEntitlementDefaults();
}

export function getCustomBusinessEntitlementDefaults(): CustomBusinessEntitlement {
  return {
    tier: "business",
    monthlyPriceEur: getPositiveNumberEnv(
      "CUSTOM_BUSINESS_MONTHLY_PRICE_EUR",
      34.99,
    ),
    dailyLimit: getPositiveIntegerEnv("CUSTOM_BUSINESS_DAILY_LIMIT", 100),
    monthlyLimit: getPositiveIntegerEnv("CUSTOM_BUSINESS_MONTHLY_LIMIT", 1000),
    reason: "Custom Business setup",
  };
}

// Helper functions for working with tiers
export function getTierByStripeProductId(productId: string): TierConfig | null {
  for (const tierConfig of Object.values(TIER_CONFIGS)) {
    if (tierConfig.stripe.productId === productId) {
      return tierConfig;
    }
  }
  return null;
}

export function getTierByStripePriceId(priceId: string): TierConfig | null {
  if (isCustomBusinessStripePriceId(priceId)) {
    return TIER_CONFIGS.business;
  }

  for (const tierConfig of Object.values(TIER_CONFIGS)) {
    if (tierConfig.stripe.priceId === priceId) {
      return tierConfig;
    }
  }
  return null;
}

export function getAllPaidTiers(): TierConfig[] {
  return Object.values(TIER_CONFIGS).filter((tier) => tier.monthlyPrice > 0);
}
