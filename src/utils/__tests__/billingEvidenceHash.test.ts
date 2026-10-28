import { it, expect } from "vitest";
import { billingEvidenceHash } from "../../../utils/billingEvidenceHash";
it("verifies JSONB-reordered payloads without losing recipient/content sensitivity", () => {
  expect(
    billingEvidenceHash({
      html: "exact",
      to: ["customer@example.com"],
      from: "sender",
    }),
  ).toBe(
    billingEvidenceHash({
      from: "sender",
      to: ["customer@example.com"],
      html: "exact",
    }),
  );
  expect(billingEvidenceHash({ html: "exact" })).not.toBe(
    billingEvidenceHash({ html: "edited" }),
  );
});
