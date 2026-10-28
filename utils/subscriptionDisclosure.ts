import { createHash } from "node:crypto";
import type Stripe from "stripe";
import policy from "../src/data/subscription-policy-2026-10-28.json";

// Never edit a released version. Add a version and retain the old public page.
export const SUBSCRIPTION_POLICY_VERSION = "2026-10-28";
export const SUBSCRIPTION_POLICY_URL =
  "https://autolister.app/billing-terms/2026-10-28";
export const SUBSCRIPTION_CONSENT = `I authorise AutoLister AI to charge the subscription amount shown automatically each month until I cancel. [Subscription terms](${SUBSCRIPTION_POLICY_URL}).`;
export const SUBSCRIPTION_SUBMIT_NOTICE =
  "Renews even if unused. Cancel renewal in Manage subscription or email support@autolister.app before the next charge; access continues until the paid period ends. Unused time is not refunded except where statutory rights apply. By subscribing, I request immediate access and accept the [Terms](https://autolister.app/terms). My statutory withdrawal rights remain unaffected.";

export function getSubscriptionCheckoutDisclosure() {
  return {
    consent_collection: { terms_of_service: "required" as const },
    custom_text: {
      terms_of_service_acceptance: { message: SUBSCRIPTION_CONSENT },
      submit: { message: SUBSCRIPTION_SUBMIT_NOTICE },
    },
    metadata: {
      billing_policy_version: SUBSCRIPTION_POLICY_VERSION,
      billing_policy_url: SUBSCRIPTION_POLICY_URL,
      billing_policy_sha256: createHash("sha256")
        .update(
          JSON.stringify({
            policy,
            consent: SUBSCRIPTION_CONSENT,
            notice: SUBSCRIPTION_SUBMIT_NOTICE,
          }),
        )
        .digest("hex"),
    },
  } satisfies Partial<Stripe.Checkout.SessionCreateParams>;
}
