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

// This will be stored in database and cached for performance
export const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    id: "free",
    name: "free",
    displayName: "Free Trial",
    description: "Get a taste of AutoLister AI",
    monthlyPrice: 0,
    stripe: {
      productId: "prod_T5HLolJrCnS2x6", // Replace with actual Stripe product ID
      priceId: "price_1S96mcP5rNq9hGDSGMayEHQ1", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 2, // Very restrictive - just a taste!
      monthly: 8, // About 3 uses over 3-4 days max
      burst: {
        perMinute: 3, // Allow a couple quick tries
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
      productId: "prod_T5HLgwjVpMBXzZ", // Replace with actual Stripe product ID
      priceId: "price_1S96n6P5rNq9hGDSjEHrJV5g", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 15, // $0.30/day cost = $9/month - losing money but growth focused
      monthly: 300, // 10 requests/day average with burst capacity
      burst: {
        perMinute: 10,
      },
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
      productId: "prod_T5HMxldgRIjyyn", // Replace with actual Stripe product ID
      priceId: "price_1S96o0P5rNq9hGDStClke9za", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 40, // $0.80/day cost = $24/month - profitable!
      monthly: 800, // 25+ requests/day average
      burst: {
        perMinute: 20,
      },
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
      productId: "prod_T5HM9khIl1EvUA", // Replace with actual Stripe product ID
      priceId: "price_1S96oFP5rNq9hGDSPZ1RpKHJ", // Replace with actual Stripe price ID
    },
    limits: {
      daily: 75, // $1.50/day cost = $45/month - good margins
      monthly: 1500, // High ceiling
      burst: {
        perMinute: 30,
      },
    },
    features: [
      "Everything in Pro",
      "Up to 75 listings per day",
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
