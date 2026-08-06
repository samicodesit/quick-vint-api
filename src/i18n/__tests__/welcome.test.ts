import { describe, expect, it } from "vitest";
import { SUPPORTED_WELCOME_LOCALES, WELCOME_COPY } from "../welcome.js";

describe("welcome checkout localization", () => {
  it("provides every paid-install checkout message in every welcome locale", () => {
    for (const locale of SUPPORTED_WELCOME_LOCALES) {
      const copy = WELCOME_COPY[locale];
      for (const [key, value] of Object.entries({
        checkoutError: copy.checkoutError,
        continuePlanTemplate: copy.continuePlanTemplate,
        finishSignIn: copy.finishSignIn,
        openingCheckout: copy.openingCheckout,
        openingSignIn: copy.openingSignIn,
        selectedPlanTemplate: copy.selectedPlanTemplate,
      })) {
        expect(typeof value, `${locale}.${key}`).toBe("string");
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
