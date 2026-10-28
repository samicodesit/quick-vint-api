import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import {
  AUTOLISTER_CHECKOUT_BRANDING,
  AUTOLISTER_CREDIT_PAYMENT_DATA,
} from "../../utils/stripeCheckoutBranding";
import { supabase } from "../../utils/supabaseClient";
import { getCreditPackConfig } from "../../utils/tierConfig";
import { handleCheckoutCors } from "../../utils/checkoutCors";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";
import {
  getMobileCheckoutUrls,
  getMobileCustomerIdempotencyKey,
  isConfirmedMissingStripeCustomerError,
  isDeletedStripeCustomer,
  MobileBillingRequestError,
  resolveMobileBillingProfile,
} from "../../utils/mobileCheckout";
import {
  isMobileWebEnabled,
  MOBILE_WEB_DISABLED_RESPONSE,
} from "../../utils/mobileWeb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await handleCheckoutCors(req, res))) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const isMobile = req.headers?.["x-autolister-client"] === "mobile_web";
  if (isMobile && !isMobileWebEnabled())
    return res.status(404).json(MOBILE_WEB_DISABLED_RESPONSE);
  let alertContext: { source?: string; profileId?: string } = {};
  try {
    const body = req.body || {};
    const pack = getCreditPackConfig(body.packId);
    if (!pack)
      return res.status(400).json({ error: "Invalid credit pack specified." });
    const source = isMobile
      ? "mobile_web"
      : typeof body.source === "string"
        ? body.source
        : "unknown";
    alertContext = { source };
    let profile: {
      id: string;
      email: string;
      stripe_customer_id: string | null;
    };
    if (isMobile) {
      profile = await resolveMobileBillingProfile(req);
    } else {
      const email = body.email;
      if (typeof email !== "string" || !email.includes("@"))
        return res.status(400).json({ error: "A valid email is required." });
      const { data, error } = await supabase
        .from("profiles")
        .select("id, stripe_customer_id")
        .ilike("email", email)
        .single();
      if (error || !data)
        return res.status(404).json({ error: "User profile was not found." });
      profile = { ...data, email };
    }
    alertContext.profileId = profile.id;
    let customerId = profile.stripe_customer_id;
    let replacementForCustomerId: string | null = null;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (isDeletedStripeCustomer(customer)) {
          replacementForCustomerId = customerId;
          customerId = null;
        }
      } catch (error) {
        if (isMobile && !isConfirmedMissingStripeCustomerError(error))
          throw error;
        replacementForCustomerId = customerId;
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: profile.email,
          metadata: {
            source: isMobile ? "mobile_web" : "auto_lister_extension",
          },
        },
        isMobile
          ? {
              idempotencyKey: getMobileCustomerIdempotencyKey(
                profile.id,
                replacementForCustomerId,
              ),
            }
          : undefined,
      );
      customerId = customer.id;
      const { error } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.id);
      if (error)
        throw new Error("Could not save the Stripe customer for this account.");
    }
    const originHeader = req.headers?.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    const utm = body.utm && typeof body.utm === "object" ? body.utm : {};
    const session = await stripe.checkout.sessions.create({
      ...AUTOLISTER_CHECKOUT_BRANDING,
      payment_intent_data: AUTOLISTER_CREDIT_PAYMENT_DATA,
      mode: "payment",
      line_items: [
        {
          price:
            pack.id === "credits_20"
              ? process.env.STRIPE_CREDIT_PACK_PRICE_ID || pack.stripePriceId
              : pack.stripePriceId,
          quantity: 1,
        },
      ],
      customer: customerId,
      success_url: isMobile
        ? getMobileCheckoutUrls({ origin, status: "success" })
        : `${process.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isMobile
        ? getMobileCheckoutUrls({ origin, status: "cancel" })
        : `${process.env.STRIPE_CANCEL_URL}?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      metadata: {
        purchase_type: "credit_pack",
        pack_id: pack.id,
        credits: String(pack.credits),
        profile_id: profile.id,
        source,
        ...Object.fromEntries(
          [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_content",
            "utm_term",
          ].map((key) => [
            key,
            typeof utm[key] === "string" ? utm[key].slice(0, 500) : "",
          ]),
        ),
      },
    });
    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    if (error instanceof MobileBillingRequestError)
      return res
        .status(error.statusCode)
        .json({ error: error.message, code: error.code });
    reportCriticalEndpointFailure({
      error,
      endpoint: "/api/stripe/create-credit-checkout",
      status: 500,
      userId: alertContext.profileId,
      details: {
        source: alertContext.source,
        error: error?.message || String(error),
        errorName: error?.name,
      },
    });
    return res
      .status(500)
      .json({ error: "Unable to open the payment page. Please try again." });
  }
}
