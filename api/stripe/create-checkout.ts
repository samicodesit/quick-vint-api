// api/stripe/create-checkout.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabase } from "../../utils/supabaseClient";
import { TIER_CONFIGS } from "../../utils/tierConfig";
import { handleCheckoutCors } from "../../utils/checkoutCors";
import {
  createBillingPortalSessionForProfile,
  findManageableBillingByEmail,
  findManageableBillingByEmailStrict,
  findManageableSubscriptionForCustomer,
  repairProfileStripeCustomerId,
} from "../../utils/stripeBillingPortal";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";
import { verifyPricingOfferToken } from "../../utils/pricingOfferToken";
import { hasPaidEntitlementStatus } from "../../src/utils/subscriptionStatus";
import {
  getMobileCustomerIdempotencyKey,
  getMobileCheckoutUrls,
  getMobilePortalReturnUrl,
  isConfirmedMissingStripeCustomerError,
  isDeletedStripeCustomer,
  MobileBillingRequestError,
  resolveMobileBillingProfile,
} from "../../utils/mobileCheckout";
import {
  getMobileWebClient,
  isMobileWebEnabled,
  MOBILE_WEB_CLIENT,
  MOBILE_WEB_DISABLED_RESPONSE,
} from "../../utils/mobileWeb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL!;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL!;
const PAID_TIERS = new Set(["starter", "pro", "business"]);
const UNINSTALL_COUPON_CODE = "LISTFASTER20";

function isUuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function pricingOfferError(message: string) {
  const error = new Error(message);
  error.name = "PricingOfferError";
  return error;
}

function isMobileWebRequest(req: VercelRequest) {
  const value = req.headers?.["x-autolister-client"];
  const client = Array.isArray(value) ? value[0] : value;
  return getMobileWebClient(client) === MOBILE_WEB_CLIENT;
}

function sanitizeMobileRef(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getRequestOrigin(req: VercelRequest) {
  const value = req.headers?.origin;
  return Array.isArray(value) ? value[0] : value;
}

async function getOfferPromotionCodeId(
  email: string,
  tier: string,
  offerToken?: string,
) {
  if (!offerToken) return null;

  let offer;
  try {
    offer = verifyPricingOfferToken(offerToken);
  } catch (error: any) {
    throw pricingOfferError(error?.message || "Offer is no longer available.");
  }
  if (offer.email.toLowerCase() !== email.trim().toLowerCase()) {
    throw pricingOfferError("Offer does not match this account.");
  }
  if (offer.targetTier !== tier) {
    throw pricingOfferError("Offer does not match this plan.");
  }
  if (!offer.couponCode) return null;

  const promotionCodes = await stripe.promotionCodes.list({
    code: offer.couponCode,
    active: true,
    limit: 1,
  });
  const promotionCode = promotionCodes.data[0];
  if (!promotionCode) {
    throw pricingOfferError("Offer is no longer available.");
  }

  return promotionCode.id;
}

async function getUninstallPromotionCodeId(
  source?: string,
  couponCode?: string,
) {
  if (source !== "uninstall_page" || couponCode !== UNINSTALL_COUPON_CODE) {
    return null;
  }

  const promotionCodes = await stripe.promotionCodes.list({
    code: UNINSTALL_COUPON_CODE,
    active: true,
    limit: 1,
  });
  return promotionCodes.data[0]?.id || null;
}

async function resolveCheckoutEmail(email?: string, userId?: string) {
  if (email && typeof email === "string" && email.includes("@")) {
    return email.trim().toLowerCase();
  }

  if (!isUuid(userId)) {
    return "";
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .single();

  if (error || !profile?.email) {
    return "";
  }

  return String(profile.email).trim().toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await handleCheckoutCors(req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (isMobileWebRequest(req) && !isMobileWebEnabled()) {
    return res.status(404).json(MOBILE_WEB_DISABLED_RESPONSE);
  }

  let alertContext: {
    userId?: string;
    tier?: string;
    source?: string;
  } = {};

  try {
    if (isMobileWebRequest(req)) {
      const profile = await resolveMobileBillingProfile(req);
      const body = (req.body || {}) as {
        tier?: unknown;
        offerToken?: unknown;
        utm?: unknown;
      };
      const tier = body.tier;
      alertContext = {
        userId: profile.id,
        tier: typeof tier === "string" ? tier : undefined,
        source: "mobile_web",
      };

      if (
        typeof tier !== "string" ||
        !PAID_TIERS.has(tier) ||
        !Object.prototype.hasOwnProperty.call(TIER_CONFIGS, tier)
      ) {
        return res.status(400).json({ error: "Invalid tier specified." });
      }

      const tierKey = tier as keyof typeof TIER_CONFIGS;
      const tierConfig = TIER_CONFIGS[tierKey];
      const priceId = tierConfig.stripe.priceId;
      const offerToken =
        typeof body.offerToken === "string" ? body.offerToken : undefined;
      const utm =
        body.utm && typeof body.utm === "object"
          ? (body.utm as Record<string, unknown>)
          : {};

      let promotionCodeId: string | null = null;
      try {
        promotionCodeId = await getOfferPromotionCodeId(
          profile.email,
          tier,
          offerToken,
        );
      } catch (offerErr: any) {
        if (offerErr?.name === "PricingOfferError") {
          return res.status(400).json({
            error: offerErr.message || "Offer is no longer available.",
          });
        }
        throw offerErr;
      }

      let customerId = profile.stripe_customer_id;
      let replacementForCustomerId: string | null = null;
      let activeSubscriptionId: string | null = null;
      if (
        hasPaidEntitlementStatus(profile.subscription_status) &&
        profile.subscription_tier !== "free" &&
        profile.stripe_subscription_id
      ) {
        activeSubscriptionId = profile.stripe_subscription_id;
      }

      if (!customerId) {
        const recoveredBilling = await findManageableBillingByEmailStrict(
          stripe,
          profile.email,
        );
        if (recoveredBilling) {
          customerId = recoveredBilling.customerId;
          activeSubscriptionId = recoveredBilling.subscriptionId;
          const { error: repairError } = await supabase
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("id", profile.id);
          if (repairError) {
            throw new Error(
              "Could not save the recovered Stripe customer for this account.",
            );
          }
        }
      }

      if (customerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (isDeletedStripeCustomer(customer)) {
            replacementForCustomerId = customerId;
            customerId = null;
            activeSubscriptionId = null;
          }
        } catch (stripeErr: any) {
          if (!isConfirmedMissingStripeCustomerError(stripeErr)) {
            throw stripeErr;
          }
          replacementForCustomerId = customerId;
          console.warn(
            "Stored mobile customer not found, will create new:",
            stripeErr?.message || stripeErr,
          );
          customerId = null;
          activeSubscriptionId = null;
        }
      }

      if (customerId && !activeSubscriptionId) {
        const manageableSubscription =
          await findManageableSubscriptionForCustomer(stripe, customerId);
        if (manageableSubscription) {
          activeSubscriptionId = manageableSubscription.id;
        }
      }

      if (customerId && activeSubscriptionId) {
        const portalSession = await createBillingPortalSessionForProfile({
          stripe,
          email: profile.email,
          customerId,
          subscriptionId: activeSubscriptionId,
          returnUrl: getMobilePortalReturnUrl(getRequestOrigin(req)),
          context: "create_checkout_mobile_active_subscriber_guard",
        });

        return res.status(200).json({
          url: portalSession.url,
          mode: "portal",
          reason: "existing_active_subscription",
        });
      }

      if (!customerId) {
        const newCustomer = await stripe.customers.create(
          {
            email: profile.email,
            metadata: { source: "mobile_web" },
          },
          {
            idempotencyKey: getMobileCustomerIdempotencyKey(
              profile.id,
              replacementForCustomerId,
            ),
          },
        );
        customerId = newCustomer.id;

        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("id", profile.id);

        if (updateErr) {
          console.error(
            "Error saving new mobile stripe_customer_id:",
            updateErr,
          );
          throw new Error(
            "Could not save the Stripe customer for this account.",
          );
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer: customerId,
        success_url: getMobileCheckoutUrls({
          origin: getRequestOrigin(req),
          status: "success",
        }),
        cancel_url: getMobileCheckoutUrls({
          origin: getRequestOrigin(req),
          status: "cancel",
        }),
        ...(promotionCodeId
          ? { discounts: [{ promotion_code: promotionCodeId }] }
          : { allow_promotion_codes: true }),
        metadata: {
          source: "mobile_web",
          tier,
          utm_source: typeof utm.utm_source === "string" ? utm.utm_source : "",
          utm_medium: typeof utm.utm_medium === "string" ? utm.utm_medium : "",
          utm_campaign:
            typeof utm.utm_campaign === "string" ? utm.utm_campaign : "",
          utm_content:
            typeof utm.utm_content === "string" ? utm.utm_content : "",
          ref: sanitizeMobileRef(utm.ref),
          utm_term: typeof utm.utm_term === "string" ? utm.utm_term : "",
        },
      });

      return res.status(200).json({ url: session.url });
    }

    const {
      email: requestEmail,
      tier,
      source,
      utm,
      offerToken,
      couponCode,
      userId,
    } = req.body as {
      email?: string;
      tier: "starter" | "pro" | "business"; // No 'free' since it's not a paid tier
      source?: string;
      utm?: Record<string, string>;
      offerToken?: string;
      couponCode?: string;
      userId?: string;
    };
    alertContext = {
      tier,
      source,
      userId: isUuid(userId) ? userId : undefined,
    };

    // 1) Validate email
    const email = await resolveCheckoutEmail(requestEmail, userId);
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    // 2) Validate tier and get price ID
    if (!tier || !PAID_TIERS.has(tier) || !TIER_CONFIGS[tier]) {
      return res.status(400).json({ error: "Invalid tier specified." });
    }

    const tierConfig = TIER_CONFIGS[tier];
    const priceId = tierConfig.stripe.priceId;
    let promotionCodeId: string | null = null;
    try {
      promotionCodeId =
        (await getOfferPromotionCodeId(email, tier, offerToken)) ||
        (await getUninstallPromotionCodeId(source, couponCode));
    } catch (offerErr: any) {
      if (offerErr?.name === "PricingOfferError") {
        return res.status(400).json({
          error: offerErr.message || "Offer is no longer available.",
        });
      }
      throw offerErr;
    }

    // 3) Look up existing stripe_customer_id in Supabase
    let customerId: string | null = null;
    let activeSubscriptionId: string | null = null;
    {
      const { data: profileRow, error: fetchErr } = await supabase
        .from("profiles")
        .select(
          "id, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier",
        )
        .ilike("email", email)
        .single();

      if (fetchErr) {
        console.error("Error fetching profile for checkout:", fetchErr);
        // continue – we can create a new customer
      } else if (profileRow) {
        alertContext.userId = profileRow.id;
        if (profileRow.stripe_customer_id) {
          customerId = profileRow.stripe_customer_id;
          if (
            hasPaidEntitlementStatus(profileRow.subscription_status) &&
            profileRow.subscription_tier &&
            profileRow.subscription_tier !== "free" &&
            profileRow.stripe_subscription_id
          ) {
            activeSubscriptionId = profileRow.stripe_subscription_id;
          }
        }
      }
    }

    // 4) If we have a customerId, verify it still exists in Stripe
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        // If no error, customer still exists, keep using it.
      } catch (stripeErr: any) {
        console.warn(
          "Stored customer not found, will create new:",
          stripeErr.message,
        );
        customerId = null;
        activeSubscriptionId = null;
      }
    }

    if (customerId && !activeSubscriptionId) {
      const manageableSubscription =
        await findManageableSubscriptionForCustomer(stripe, customerId);
      if (manageableSubscription) {
        activeSubscriptionId = manageableSubscription.id;
      }
    }

    if (!customerId) {
      const existingBilling = await findManageableBillingByEmail(stripe, email);
      if (existingBilling) {
        customerId = existingBilling.customerId;
        activeSubscriptionId = existingBilling.subscriptionId;
        await repairProfileStripeCustomerId(email, customerId);
      }
    }

    // Existing subscribers should update their current subscription in Stripe's
    // customer portal. This prevents duplicate subscriptions if Supabase or the
    // frontend has stale plan state. The helper verifies the subscription's real
    // customer before creating the portal session.
    if (customerId && activeSubscriptionId) {
      const portalSession = await createBillingPortalSessionForProfile({
        stripe,
        email,
        customerId,
        subscriptionId: activeSubscriptionId,
        returnUrl: process.env.STRIPE_PORTAL_RETURN_URL!,
        context: "create_checkout_active_subscriber_guard",
      });

      return res.status(200).json({
        url: portalSession.url,
        mode: "portal",
        reason: "existing_active_subscription",
      });
    }

    // 5) If no valid customerId, create a new Stripe Customer
    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: { source: "auto_lister_extension" },
      });
      customerId = newCustomer.id;

      // Persist stripe_customer_id back to Supabase
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .ilike("email", email);

      if (updateErr) {
        console.error("Error saving new stripe_customer_id:", updateErr);
        // But we can proceed with the new customerId anyway.
      }
    }

    // 6) Create Stripe Checkout Session using priceId and the validated customerId
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: customerId,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CANCEL_URL}?session_id={CHECKOUT_SESSION_ID}`,
      ...(promotionCodeId
        ? { discounts: [{ promotion_code: promotionCodeId }] }
        : { allow_promotion_codes: true }),
      metadata: {
        source: source || "unknown",
        tier,
        utm_source: utm?.utm_source || "",
        utm_medium: utm?.utm_medium || "",
        utm_campaign: utm?.utm_campaign || "",
        utm_content: utm?.utm_content || "",
        utm_term: utm?.utm_term || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    if (err instanceof MobileBillingRequestError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
    }

    console.error("❌ create-checkout error:", err);
    reportCriticalEndpointFailure({
      error: err,
      endpoint: "/api/stripe/create-checkout",
      status: 500,
      userId: alertContext.userId,
      details: {
        tier: alertContext.tier,
        source: alertContext.source,
        error: err?.message || String(err),
        errorName: err?.name,
      },
    });
    return res.status(500).json({ error: err.message });
  }
}
