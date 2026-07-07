import crypto from "node:crypto";

export type CustomerUsageTokenPayload = {
  v: 1;
  email: string;
  expiresAt: string;
  issuedAt: string;
  source: "customer_usage_link";
};

function getCustomerUsageSecret() {
  const secret =
    process.env.CUSTOMER_USAGE_TOKEN_SECRET ||
    process.env.PRICING_OFFER_TOKEN_SECRET ||
    process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error(
      "Missing CUSTOMER_USAGE_TOKEN_SECRET, PRICING_OFFER_TOKEN_SECRET, or ADMIN_SECRET",
    );
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
      .createHmac("sha256", getCustomerUsageSecret())
      .update(encodedPayload)
      .digest(),
  );
}

function validateCustomerUsagePayload(
  payload: Partial<CustomerUsageTokenPayload>,
): asserts payload is CustomerUsageTokenPayload {
  if (payload.v !== 1) {
    throw new Error("Unsupported usage token version");
  }
  if (
    !payload.email ||
    typeof payload.email !== "string" ||
    !payload.email.includes("@")
  ) {
    throw new Error("Invalid usage token email");
  }
  if (!payload.expiresAt || Number.isNaN(Date.parse(payload.expiresAt))) {
    throw new Error("Invalid usage token expiry");
  }
  if (!payload.issuedAt || Number.isNaN(Date.parse(payload.issuedAt))) {
    throw new Error("Invalid usage token issued time");
  }
  if (payload.source !== "customer_usage_link") {
    throw new Error("Invalid usage token source");
  }
}

export function createCustomerUsageToken(
  payload: Omit<CustomerUsageTokenPayload, "v" | "issuedAt" | "source"> & {
    issuedAt?: string;
  },
) {
  const normalizedPayload: CustomerUsageTokenPayload = {
    v: 1,
    email: payload.email.trim().toLowerCase(),
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt || new Date().toISOString(),
    source: "customer_usage_link",
  };

  validateCustomerUsagePayload(normalizedPayload);

  const encodedPayload = base64UrlEncode(JSON.stringify(normalizedPayload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function createCustomerUsageUrl(
  payload: Parameters<typeof createCustomerUsageToken>[0],
  baseUrl = process.env.AUTOLISTER_SITE_URL || "https://autolister.app",
) {
  const token = createCustomerUsageToken(payload);
  const url = new URL("/customer-usage", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function verifyCustomerUsageToken(token: string) {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    throw new Error("Invalid usage token format");
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new Error("Invalid usage token signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  validateCustomerUsagePayload(payload);

  if (Date.parse(payload.expiresAt) <= Date.now()) {
    throw new Error("Usage token expired");
  }

  return payload as CustomerUsageTokenPayload;
}
