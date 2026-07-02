import {
  COMPATIBILITY_TIER_CONFIGS,
  CREDIT_PACK_CONFIG,
  FREE_LIFETIME_LIMIT,
  TIER_CONFIGS,
} from "../../utils/tierConfig.js";

export type PublicPricingDisplayMode = "legacy" | "current";

export type PricingDisplayLabels = {
  listingsPerDay: string;
  listingsPerMonth: string;
  noDailyLimit: string;
};

const ENGLISH_LABELS: PricingDisplayLabels = {
  listingsPerDay: "/ day",
  listingsPerMonth: "/ month",
  noDailyLimit: "No Daily Limit",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function getPublicPricingDisplayMode(
  value?: string,
): PublicPricingDisplayMode {
  return value === "legacy" ? "legacy" : "current";
}

export function getPricingDisplay(
  value?: string,
  labels: PricingDisplayLabels = ENGLISH_LABELS,
) {
  const mode = getPublicPricingDisplayMode(value);
  const isCurrent = mode === "current";
  const configs = isCurrent ? TIER_CONFIGS : COMPATIBILITY_TIER_CONFIGS;

  return {
    mode,
    isCurrent,
    creditPack: {
      credits: CREDIT_PACK_CONFIG.credits,
      priceLabel: `€${CREDIT_PACK_CONFIG.priceEur.toFixed(2)}`,
    },
    limits: isCurrent
      ? {
          freePrimaryValue: String(FREE_LIFETIME_LIMIT),
          freePrimaryLabel: " lifetime listings",
          freeSecondaryText: "No daily or monthly free reset",
          freeSecondaryValue: null,
          freeSecondaryLabel: "",
          starterDaily: formatNumber(configs.starter.limits.daily),
          starterMonthly: formatNumber(configs.starter.limits.monthly),
          proDaily: formatNumber(configs.pro.limits.daily),
          proMonthly: formatNumber(configs.pro.limits.monthly),
          businessDaily: formatNumber(configs.business.limits.daily),
          businessMonthly: formatNumber(configs.business.limits.monthly),
        }
      : {
          freePrimaryValue: formatNumber(configs.free.limits.daily),
          freePrimaryLabel: ` ${labels.listingsPerDay}`,
          freeSecondaryText: null,
          freeSecondaryValue: formatNumber(configs.free.limits.monthly),
          freeSecondaryLabel: ` ${labels.listingsPerMonth}`,
          starterDaily: formatNumber(configs.starter.limits.daily),
          starterMonthly: formatNumber(configs.starter.limits.monthly),
          proDaily: formatNumber(configs.pro.limits.daily),
          proMonthly: formatNumber(configs.pro.limits.monthly),
          businessDaily: labels.noDailyLimit,
          businessMonthly: formatNumber(configs.business.limits.monthly),
        },
  };
}

export function getPricingGuideCopy(value?: string) {
  const mode = getPublicPricingDisplayMode(value);
  const isCurrent = mode === "current";

  return {
    isCurrent,
    freePricingCopy: isCurrent
      ? "5 lifetime AI-generated listings"
      : "2 AI-generated descriptions per day",
    paidPricingCopy: isCurrent
      ? "10/day (Starter), 25/day (Pro), and 60/day (Business)"
      : "15/day (Starter), 40/day (Pro), and 75/day (Business)",
  };
}

export function getPricingTermsCopy(value?: string) {
  const mode = getPublicPricingDisplayMode(value);
  const isCurrent = mode === "current";

  return {
    isCurrent,
    free: isCurrent
      ? "5 lifetime listings per account"
      : "2 listings per day, 8 listings per month",
    starter: isCurrent
      ? "10 listings per day, 75 per month"
      : "15 listings per day, 300 per month",
    pro: isCurrent
      ? "25 listings per day, 250 per month"
      : "40 listings per day, 800 per month",
    business: isCurrent
      ? "60 listings per day, 600 per month"
      : "No daily limit, 1,500 per month",
  };
}
