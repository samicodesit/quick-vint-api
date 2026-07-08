#!/usr/bin/env node
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error("Missing STRIPE_SECRET_KEY.");
  process.exit(1);
}

const execute = process.argv.includes("--execute");
const freePriceIds = (
  process.env.STRIPE_FREE_SUBSCRIPTION_PRICE_IDS ||
  "price_1S96mcP5rNq9hGDSGMayEHQ1"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const stripe = new Stripe(stripeKey, {});
let scanned = 0;
let matched = 0;
let canceled = 0;

console.log(
  `${execute ? "EXECUTE" : "DRY RUN"}: active free-trial Stripe subscriptions`,
);
console.log(`Target price IDs: ${freePriceIds.join(", ")}`);

for await (const subscription of stripe.subscriptions.list({
  status: "active",
  limit: 100,
  expand: ["data.customer"],
})) {
  scanned += 1;
  const matchingItem = subscription.items.data.find((item) =>
    freePriceIds.includes(item.price.id),
  );

  if (!matchingItem) continue;
  matched += 1;

  const customer = subscription.customer;
  const email =
    customer && typeof customer === "object" && "email" in customer
      ? customer.email || ""
      : "";
  const productId =
    typeof matchingItem.price.product === "string"
      ? matchingItem.price.product
      : matchingItem.price.product?.id || "";

  console.log(
    [
      subscription.id,
      email || "(no email)",
      matchingItem.price.id,
      productId || "(no product id)",
      subscription.cancel_at_period_end ? "already canceling" : "active",
    ].join(" | "),
  );

  if (execute) {
    await stripe.subscriptions.cancel(subscription.id);
    canceled += 1;
  }
}

console.log(
  `Done. Scanned ${scanned}, matched ${matched}, ${
    execute ? `canceled ${canceled}` : "canceled 0 (dry run)"
  }.`,
);
console.log(
  execute
    ? "Stripe will emit subscription.deleted webhooks for canceled subscriptions."
    : "Re-run with --execute to cancel the matched free-trial subscriptions.",
);
