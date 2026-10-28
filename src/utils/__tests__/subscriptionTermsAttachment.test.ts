import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import policy from "../../data/subscription-policy-2026-10-28.json";
import asset from "../../data/subscription-terms-2026-10-28.json";
import { getPaidWelcomeTemplate } from "../../../utils/emailTemplates";

describe("subscription terms attachment", () => {
  it("keeps the bundled PDF tied to the exact policy customers accepted", () => {
    expect(asset.policySha256).toBe(
      createHash("sha256").update(JSON.stringify(policy)).digest("hex"),
    );
    expect(asset.policyVersion).toBe(policy.version);
    const pdf = Buffer.from(asset.attachment.content, "base64");
    expect(createHash("sha256").update(pdf).digest("hex")).toBe(
      asset.pdfSha256,
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(asset.attachment.contentType).toBe("application/pdf");
  });

  it.each(["starter", "pro", "business"] as const)(
    "includes the durable PDF for %s and does not attach new terms to historical plans",
    (tier) => {
      const current = getPaidWelcomeTemplate(tier, {
        billing: { policyVersion: "2026-10-28" },
      });
      expect(current.attachments).toEqual([asset.attachment]);
      expect(getPaidWelcomeTemplate(tier).attachments).toBeUndefined();
      expect(
        getPaidWelcomeTemplate(tier, {
          billing: { policyVersion: "historical" },
        }).attachments,
      ).toBeUndefined();
    },
  );
});
