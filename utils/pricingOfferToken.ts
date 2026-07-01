import crypto from "node:crypto";

export type PricingOfferTier = "starter" | "pro" | "business";

export type PricingOfferTokenPayload = {
  v: 1;
  email: string;
  targetTier: PricingOfferTier;
  couponCode?: string;
  expiresAt: string;
  issuedAt: string;
  source: "pricing_offer_email";
};

const VALID_TARGET_TIERS = new Set<PricingOfferTier>([
  "starter",
  "pro",
  "business",
]);

function getPricingOfferSecret() {
  const secret =
    process.env.PRICING_OFFER_TOKEN_SECRET || process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("Missing PRICING_OFFER_TOKEN_SECRET or ADMIN_SECRET");
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string) {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  return Buffer.from(
    padded.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function signPayload(encodedPayload: string) {
  return base64UrlEncode(
    crypto
      .createHmac("sha256", getPricingOfferSecret())
      .update(encodedPayload)
      .digest(),
  );
}

export function createPricingOfferToken(
  payload: Omit<PricingOfferTokenPayload, "v" | "issuedAt" | "source"> & {
    issuedAt?: string;
  },
) {
  const normalizedPayload: PricingOfferTokenPayload = {
    v: 1,
    email: payload.email.trim().toLowerCase(),
    targetTier: payload.targetTier,
    couponCode: payload.couponCode?.trim(),
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt || new Date().toISOString(),
    source: "pricing_offer_email",
  };

  validatePricingOfferPayload(normalizedPayload);

  const encodedPayload = base64UrlEncode(JSON.stringify(normalizedPayload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function createPricingOfferUrl(
  payload: Parameters<typeof createPricingOfferToken>[0],
  baseUrl = process.env.AUTOLISTER_SITE_URL || "https://autolister.app",
  options: { utmCampaign?: string } = {},
) {
  const token = createPricingOfferToken(payload);
  const url = new URL("/pricing", baseUrl);
  url.searchParams.set("offer", token);
  url.searchParams.set("utm_source", "email");
  url.searchParams.set("utm_medium", "customer_email");
  url.searchParams.set(
    "utm_campaign",
    options.utmCampaign || "pricing_offer_email",
  );
  return url.toString();
}

export function verifyPricingOfferToken(token: string) {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    throw new Error("Invalid offer token format");
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new Error("Invalid offer token signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  validatePricingOfferPayload(payload);

  if (Date.parse(payload.expiresAt) <= Date.now()) {
    throw new Error("Offer token expired");
  }

  return payload as PricingOfferTokenPayload;
}

function validatePricingOfferPayload(
  payload: Partial<PricingOfferTokenPayload>,
): asserts payload is PricingOfferTokenPayload {
  if (payload.v !== 1) {
    throw new Error("Unsupported offer token version");
  }
  if (
    !payload.email ||
    typeof payload.email !== "string" ||
    !payload.email.includes("@")
  ) {
    throw new Error("Invalid offer token email");
  }
  if (
    !payload.targetTier ||
    !VALID_TARGET_TIERS.has(payload.targetTier as PricingOfferTier)
  ) {
    throw new Error("Invalid offer token target tier");
  }
  if (!payload.expiresAt || Number.isNaN(Date.parse(payload.expiresAt))) {
    throw new Error("Invalid offer token expiry");
  }
  if (!payload.issuedAt || Number.isNaN(Date.parse(payload.issuedAt))) {
    throw new Error("Invalid offer token issued time");
  }
  if (payload.source !== "pricing_offer_email") {
    throw new Error("Invalid offer token source");
  }
}
