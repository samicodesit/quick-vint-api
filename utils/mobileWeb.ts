import { isAllowedAppOrigin } from "./allowedOrigins";
import {
  getPricingLimitsMode,
  getPricingLimitsModeForExtension,
  type PricingLimitsMode,
} from "./tierConfig";

export const MOBILE_WEB_CLIENT = "mobile_web" as const;
export const MOBILE_WEB_DISABLED_RESPONSE = {
  error: "Mobile web app unavailable.",
  code: "mobile_web_disabled",
} as const;

const DEFAULT_APP_ORIGIN = "https://autolister.app";
const MOBILE_WEB_CALLBACK_PATH = "/app/auth/callback";
const MOBILE_WEB_RETURN_PATH = "/app";
const MOBILE_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getMobileWebClient(value: unknown): "mobile_web" | null {
  return value === MOBILE_WEB_CLIENT ? MOBILE_WEB_CLIENT : null;
}

export function getPricingLimitsModeForClient(args: {
  client?: unknown;
  extensionVersion?: string | null;
}): PricingLimitsMode {
  return getMobileWebClient(args.client) === MOBILE_WEB_CLIENT
    ? getPricingLimitsMode()
    : getPricingLimitsModeForExtension(args.extensionVersion);
}

export function isMobileWebEnabled(
  env: typeof process.env = process.env,
): boolean {
  return env.MOBILE_WEB_APP_ENABLED === "true";
}

export function getMobileWebCallbackUrl(origin?: string): string {
  const appOrigin =
    origin && isAllowedAppOrigin(origin) ? origin : DEFAULT_APP_ORIGIN;
  return `${appOrigin}${MOBILE_WEB_CALLBACK_PATH}`;
}

export function getMobileWebReturnUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    !isAllowedAppOrigin(url.origin) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/" && path !== MOBILE_WEB_RETURN_PATH) return null;

  return `${url.origin}${MOBILE_WEB_RETURN_PATH}`;
}

export function isValidMobileRequestId(value: unknown): boolean {
  return typeof value === "string" && MOBILE_REQUEST_ID_PATTERN.test(value);
}

export { isAllowedAppOrigin, isAllowedVintedOrigin } from "./allowedOrigins";
