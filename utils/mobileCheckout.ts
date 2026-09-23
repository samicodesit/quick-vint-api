import type { VercelRequest } from "@vercel/node";
import { isAllowedAppOrigin } from "./allowedOrigins";
import { supabase } from "./supabaseClient";

const DEFAULT_APP_ORIGIN = "https://autolister.app";
const MOBILE_PROFILE_SELECT =
  "id, email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier";

export type MobileBillingProfile = {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  subscription_tier: string;
};

export function isDeletedStripeCustomer(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { deleted?: unknown }).deleted === true,
  );
}

export function isConfirmedMissingStripeCustomerError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "resource_missing"
  );
}

export function getMobileCustomerIdempotencyKey(
  profileId: string,
  replacementForCustomerId?: string | null,
): string {
  return replacementForCustomerId
    ? `mobile-web-customer:${profileId}:replacement:${replacementForCustomerId}`
    : `mobile-web-customer:${profileId}`;
}

export class MobileBillingRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = "MobileBillingRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function getBearerToken(req: VercelRequest): string {
  const authorization = getHeader(req, "authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/);
  if (!match) {
    throw new MobileBillingRequestError(
      401,
      "A valid bearer token is required.",
      "unauthorized",
    );
  }

  return match[1];
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRequiredEmail(value: unknown): string {
  const email = normalizeNullableString(value)?.toLowerCase() || "";
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new MobileBillingRequestError(
      400,
      "A valid email is required for billing.",
      "invalid_billing_email",
    );
  }

  return email;
}

function normalizeStatus(value: unknown): string {
  return normalizeNullableString(value) || "free";
}

function getApprovedOrigin(origin?: string): string {
  return origin && isAllowedAppOrigin(origin) ? origin : DEFAULT_APP_ORIGIN;
}

export async function resolveMobileBillingProfile(
  req: VercelRequest,
): Promise<MobileBillingProfile> {
  const token = getBearerToken(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user?.id) {
    throw new MobileBillingRequestError(
      401,
      "Invalid or expired token.",
      "unauthorized",
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(MOBILE_PROFILE_SELECT)
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new MobileBillingRequestError(
      500,
      "Could not retrieve billing account.",
      "profile_read_failed",
    );
  }

  if (!data || typeof data.id !== "string" || data.id !== user.id) {
    throw new MobileBillingRequestError(
      404,
      "Billing account was not found.",
      "profile_not_found",
    );
  }

  return {
    id: data.id,
    email: normalizeRequiredEmail(data.email),
    stripe_customer_id: normalizeNullableString(data.stripe_customer_id),
    stripe_subscription_id: normalizeNullableString(
      data.stripe_subscription_id,
    ),
    subscription_status: normalizeStatus(data.subscription_status),
    subscription_tier: normalizeStatus(data.subscription_tier),
  };
}

export function getMobileCheckoutUrls(input: {
  origin?: string;
  status: "success" | "cancel";
}): string {
  const origin = getApprovedOrigin(input.origin);
  const checkoutState = input.status === "success" ? "success" : "cancel";
  return `${origin}/app?checkout=${checkoutState}&session_id={CHECKOUT_SESSION_ID}`;
}

export function getMobilePortalReturnUrl(origin?: string): string {
  return `${getApprovedOrigin(origin)}/app?checkout=manage`;
}
