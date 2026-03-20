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
    /** null = no per-day limit (free tier uses a lifetime total tracked via `monthly`) */
    daily: number | null;
    monthly: number;
    burst: {
      perMinute: number;
    };
  };
  features: string[];
}

// This will be stored in database and cached for performance
export const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    id: "free",
    name: "free",
    displayName: "Free",
    description: "Get a taste of AutoLister AI",
    monthlyPrice: 0,
    stripe: {
      productId: "prod_T5HLolJrCnS2x6",
      priceId: "price_1S96mcP5rNq9hGDSGMayEHQ1",
    },
    limits: {
      daily: null, // No per-day cap — lifetime total enforced via `monthly`
      monthly: 4, // Lifetime total (never reset for free users)
      burst: {
        perMinute: 3,
      },
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
      daily: 5,
      monthly: 75,
      burst: {
        perMinute: 5,
      },
    },
    features: [
      "AI-generated titles and descriptions",
      "Priority support",
      "Up to 5 listings per day",
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
      daily: 15,
      monthly: 300,
      burst: {
        perMinute: 10,
      },
    },
    features: [
      "Everything in Starter",
      "Up to 15 listings per day",
      "Tone & emoji customization",
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
    limits: {
      daily: 50,
      monthly: 1000,
      burst: {
        perMinute: 20,
      },
    },
    features: [
      "Everything in Pro",
      "Up to 50 listings per day",
      "Dedicated support",
      "Highest daily limits",
    ],
  },
};

// Future expansion ready
export const ENTERPRISE_TIER = {
  // Custom pricing, dedicated infrastructure, SLA, etc.
};

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

/**
 * Returns a client-safe subset of tier configs (no Stripe secrets).
 * Used by the /api/tier-config endpoint so the extension can stay in sync.
 */
export function getPublicTierConfigs() {
  const publicConfigs: Record<
    string,
    {
      displayName: string;
      monthlyPrice: number;
      limits: { daily: number | null; monthly: number };
      features: string[];
    }
  > = {};
  for (const [key, tier] of Object.entries(TIER_CONFIGS)) {
    publicConfigs[key] = {
      displayName: tier.displayName,
      monthlyPrice: tier.monthlyPrice,
      limits: {
        daily: tier.limits.daily,
        monthly: tier.limits.monthly,
      },
      features: tier.features,
    };
  }
  return publicConfigs;
}
