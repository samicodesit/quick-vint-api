import { describe, expect, it } from "vitest";
import { getSubscriptionCheckoutDisclosure } from "../../../utils/subscriptionDisclosure";

describe("subscription checkout disclosure", () => {
  it("requires active recurring acceptance without inventing a charge or waiving rights", () => {
    const fields = getSubscriptionCheckoutDisclosure();
    expect(fields.consent_collection.terms_of_service).toBe("required");
    expect(fields.custom_text.terms_of_service_acceptance.message).toContain(
      "automatically each month",
    );
    expect(fields.custom_text.terms_of_service_acceptance.message).toContain(
      "amount shown",
    );
    expect(fields.custom_text.submit.message).toContain("even if unused");
    expect(fields.custom_text.submit.message).toContain("statutory");
    expect(fields.metadata.billing_policy_version).toBeTruthy();
    expect(fields.metadata.billing_policy_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fields.custom_text.submit.message.length).toBeLessThan(500);
    expect(JSON.stringify(fields)).not.toMatch(/waive|€9.99/);
  });
});
