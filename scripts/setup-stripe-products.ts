/**
 * One-time script to create AutoLister Stripe products and prices.
 *
 * Run once per environment (test / live):
 *   STRIPE_SECRET_KEY=sk_... npx ts-node --esm scripts/setup-stripe-products.ts
 *
 * Copy the printed price IDs into utils/tierConfig.ts (NEW_TIER_CONFIGS and PACK_CONFIG).
 */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

interface ProductSpec {
  key: string;
  name: string;
  description: string;
  mode: "subscription" | "payment";
  currency: "eur";
  unitAmount: number; // cents
  interval?: "month";
}

const PRODUCTS: ProductSpec[] = [
  {
    key: "pack",
    name: "AutoLister Closet Clear Pack",
    description: "15 permanent credits — never expire",
    mode: "payment",
    currency: "eur",
    unitAmount: 399,
  },
  {
    key: "starter_v2",
    name: "AutoLister Starter",
    description: "80 credits/month, rollover up to 240",
    mode: "subscription",
    currency: "eur",
    unitAmount: 599,
    interval: "month",
  },
  {
    key: "plus",
    name: "AutoLister Plus",
    description: "200 credits/month, rollover up to 600, Listing Preferences",
    mode: "subscription",
    currency: "eur",
    unitAmount: 999,
    interval: "month",
  },
  {
    key: "pro_v2",
    name: "AutoLister Pro",
    description:
      "400 credits/month, rollover up to 1,200, Tone Control, Emoji, Multi-lang",
    mode: "subscription",
    currency: "eur",
    unitAmount: 1499,
    interval: "month",
  },
  {
    key: "business_v2",
    name: "AutoLister Business",
    description:
      "1,000 credits/month, rollover up to 3,000, Priority processing",
    mode: "subscription",
    currency: "eur",
    unitAmount: 2499,
    interval: "month",
  },
];

async function main() {
  console.log("Creating AutoLister Stripe products and prices...\n");

  const results: Record<string, { productId: string; priceId: string }> = {};

  for (const spec of PRODUCTS) {
    const product = await stripe.products.create({
      name: spec.name,
      description: spec.description,
      metadata: { autolister_key: spec.key },
    });

    const priceParams: Stripe.PriceCreateParams = {
      product: product.id,
      currency: spec.currency,
      unit_amount: spec.unitAmount,
      metadata: { autolister_key: spec.key },
    };

    if (spec.mode === "subscription" && spec.interval) {
      priceParams.recurring = { interval: spec.interval };
    }

    const price = await stripe.prices.create(priceParams);

    results[spec.key] = { productId: product.id, priceId: price.id };
    console.log(`✅ ${spec.key}: product=${product.id}  price=${price.id}`);
  }

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("Paste the following into backend/utils/tierConfig.ts:\n");

  for (const [key, ids] of Object.entries(results)) {
    console.log(`  ${key}:`);
    console.log(`    productId: "${ids.productId}",`);
    console.log(`    priceId:   "${ids.priceId}",`);
  }

  console.log("\nDone. Run this script once per Stripe environment (test/live).");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
