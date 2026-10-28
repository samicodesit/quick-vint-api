// Stripe accepts this per-session field with our current API version, although
// stripe-node 18 predates its type declaration. Sandbox-verified 2026-10-28.
// This changes the Checkout heading, not the shared account's receipt issuer.
export const AUTOLISTER_CHECKOUT_BRANDING = {
  branding_settings: { display_name: "AutoLister AI" },
};

// Card payments retain the account prefix: SAMISOFT* AUTOLISTER (20 chars).
// AUTOLISTER AI would exceed Stripe's 22-character combined limit.
// Subscription statements use the Stripe Product descriptor instead.
export const AUTOLISTER_CREDIT_PAYMENT_DATA = {
  statement_descriptor_suffix: "AUTOLISTER",
};
