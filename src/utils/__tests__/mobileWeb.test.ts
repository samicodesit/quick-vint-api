import { afterEach, describe, expect, it } from "vitest";
import {
  getMobileWebCallbackUrl,
  getMobileWebClient,
  getMobileWebReturnUrl,
  getPricingLimitsModeForClient,
  isAllowedAppOrigin,
  isAllowedMobileRedirectOrigin,
  isAllowedVintedOrigin,
  isMobileWebEnabled,
  isValidMobileRequestId,
  MOBILE_WEB_CLIENT,
} from "../../../utils/mobileWeb";
import {
  getPricingLimitsMode,
  getPricingLimitsModeForExtension,
} from "../../../utils/tierConfig";

const originalEnvironment = {
  mobileEnabled: process.env.MOBILE_WEB_APP_ENABLED,
  pricingMode: process.env.PRICING_LIMITS_MODE,
  allowedOrigins: process.env.VERCEL_APP_ALLOWED_ORIGINS,
};

afterEach(() => {
  if (originalEnvironment.mobileEnabled === undefined) {
    delete process.env.MOBILE_WEB_APP_ENABLED;
  } else {
    process.env.MOBILE_WEB_APP_ENABLED = originalEnvironment.mobileEnabled;
  }

  if (originalEnvironment.pricingMode === undefined) {
    delete process.env.PRICING_LIMITS_MODE;
  } else {
    process.env.PRICING_LIMITS_MODE = originalEnvironment.pricingMode;
  }

  if (originalEnvironment.allowedOrigins === undefined) {
    delete process.env.VERCEL_APP_ALLOWED_ORIGINS;
  } else {
    process.env.VERCEL_APP_ALLOWED_ORIGINS = originalEnvironment.allowedOrigins;
  }
});

describe("mobile web server context", () => {
  it("preserves extension pricing mode for non-mobile requests", () => {
    process.env.PRICING_LIMITS_MODE = "legacy";

    expect(MOBILE_WEB_CLIENT).toBe("mobile_web");
    expect(getMobileWebClient("mobile_web")).toBe("mobile_web");
    expect(getMobileWebClient(" mobile_web")).toBeNull();
    expect(getMobileWebClient(undefined)).toBeNull();
    expect(
      getPricingLimitsModeForClient({
        client: "mobile_web",
        extensionVersion: "1.2.0",
      }),
    ).toBe(getPricingLimitsMode());
    expect(getPricingLimitsModeForClient({ extensionVersion: "1.3.13" })).toBe(
      getPricingLimitsModeForExtension("1.3.13"),
    );
  });

  it("requires the exact server flag and approved origins", () => {
    expect(
      isMobileWebEnabled({
        MOBILE_WEB_APP_ENABLED: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isMobileWebEnabled({
        MOBILE_WEB_APP_ENABLED: "TRUE",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(isMobileWebEnabled({} as NodeJS.ProcessEnv)).toBe(false);

    process.env.VERCEL_APP_ALLOWED_ORIGINS =
      "https://preview.autolister.app, https://staging.autolister.app";
    expect(isAllowedAppOrigin()).toBe(true);
    expect(isAllowedAppOrigin("https://autolister.app")).toBe(true);
    expect(isAllowedAppOrigin("https://www.autolister.app")).toBe(true);
    expect(isAllowedAppOrigin("https://preview.autolister.app")).toBe(true);
    expect(isAllowedAppOrigin("https://evil.example")).toBe(false);
    expect(isAllowedAppOrigin("https://autolister.app.evil.example")).toBe(
      false,
    );

    process.env.VERCEL_APP_ALLOWED_ORIGINS =
      "https://preview.autolister.app, chrome-extension://legacy-extension, http://insecure.example";
    expect(
      isAllowedMobileRedirectOrigin("https://preview.autolister.app"),
    ).toBe(true);
    expect(
      isAllowedMobileRedirectOrigin("chrome-extension://legacy-extension"),
    ).toBe(false);
    expect(isAllowedMobileRedirectOrigin("http://insecure.example")).toBe(
      false,
    );

    expect(isAllowedVintedOrigin("https://www.vinted.fr")).toBe(true);
    expect(isAllowedVintedOrigin("https://www.vinted.com.au")).toBe(true);
    expect(isAllowedVintedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedVintedOrigin()).toBe(false);
  });

  it("builds fixed app callback and return URLs only for approved origins", () => {
    process.env.VERCEL_APP_ALLOWED_ORIGINS = "https://preview.autolister.app";

    expect(getMobileWebCallbackUrl()).toBe(
      "https://autolister.app/app/auth/callback",
    );
    expect(getMobileWebCallbackUrl("https://preview.autolister.app")).toBe(
      "https://preview.autolister.app/app/auth/callback",
    );
    expect(getMobileWebCallbackUrl("https://evil.example")).toBe(
      "https://autolister.app/app/auth/callback",
    );

    expect(getMobileWebReturnUrl("https://autolister.app")).toBe(
      "https://autolister.app/app",
    );
    expect(getMobileWebReturnUrl("https://autolister.app/app")).toBe(
      "https://autolister.app/app",
    );
    expect(getMobileWebReturnUrl("https://preview.autolister.app/app")).toBe(
      "https://preview.autolister.app/app",
    );
    expect(getMobileWebReturnUrl("https://evil.example/app")).toBeNull();
    expect(
      getMobileWebReturnUrl({ origin: "https://autolister.app" }),
    ).toBeNull();
  });

  it("accepts only UUID v4 mobile request IDs", () => {
    expect(isValidMobileRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      true,
    );
    expect(isValidMobileRequestId("550e8400-e29b-11d4-a716-446655440000")).toBe(
      false,
    );
    expect(isValidMobileRequestId("not-a-request-id")).toBe(false);
    expect(isValidMobileRequestId(123)).toBe(false);
  });
});
