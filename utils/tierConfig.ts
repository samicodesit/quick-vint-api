// New tier configuration system - database driven for easy updates
export interface TierConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  limits: {
    daily: number;
    monthly: number;
    burst: {
      perMinute: number;
      perHour: number;
    };
  };
  features: string[];
  overage?: {
    enabled: boolean;
    pricePerRequest: number;
    dailyOverageLimit?: number;
  };
}

// This will be stored in database and cached for performance
export const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    id: 'free',
    name: 'free',
    displayName: 'Free Trial',
    description: 'Get a taste of AutoLister AI',
    monthlyPrice: 0,
    limits: {
      daily: 2,      // Very restrictive - just a taste!
      monthly: 10,   // About 3 uses over 3-4 days max
      burst: {
        perMinute: 3,  // Allow a couple quick tries
        perHour: 5,    // Very limited
      }
    },
    features: [
      'AI-generated titles and descriptions',
      'Basic support'
    ]
  },
  
  starter: {
    id: 'starter',
    name: 'starter',
    displayName: 'Starter',
    description: 'Perfect for casual Vinted sellers',
    monthlyPrice: 3.99,
    limits: {
      daily: 15,      // $0.30/day cost = $9/month - losing money but growth focused
      monthly: 300,   // 10 requests/day average with burst capacity
      burst: {
        perMinute: 10,
        perHour: 40,
      }
    },
    features: [
      'AI-generated titles and descriptions',
      'Priority support',
      'Up to 15 listings per day'
    ]
  },

  pro: {
    id: 'pro', 
    name: 'pro',
    displayName: 'Pro',
    description: 'For active sellers listing daily',
    monthlyPrice: 9.99,
    limits: {
      daily: 40,      // $0.80/day cost = $24/month - profitable!
      monthly: 800,   // 25+ requests/day average
      burst: {
        perMinute: 20,
        perHour: 80,
      }
    },
    features: [
      'Everything in Starter',
      'Up to 40 listings per day',
      'Priority processing'
    ]
  },

  business: {
    id: 'business',
    name: 'business', 
    displayName: 'Business',
    description: 'For resellers and high-volume sellers',
    monthlyPrice: 19.99,
    limits: {
      daily: 75,      // $1.50/day cost = $45/month - good margins
      monthly: 1500,  // High ceiling
      burst: {
        perMinute: 30,
        perHour: 120,
      }
    },
    features: [
      'Everything in Pro',
      'Up to 75 listings per day',
      'Dedicated support',
      'Overage requests available'
    ],
    overage: {
      enabled: true,
      pricePerRequest: 0.05, // $0.05 vs $0.0201 cost = good margins
      dailyOverageLimit: 25   // Max 25 overage requests per day
    }
  }
};

// Future expansion ready
export const ENTERPRISE_TIER = {
  // Custom pricing, dedicated infrastructure, SLA, etc.
};