import { describe, expect, it } from "vitest";
import {
  BRAND,
  TEMPLATES,
  getPaidWelcomeTemplate,
  getTemplateIndex,
  wrapDirectReplyLayout,
} from "../../../utils/emailTemplates";

describe("email templates", () => {
  it("renders concise tier-specific paid welcome emails", () => {
    expect(getTemplateIndex().map((template) => template.key)).toContain(
      "starter_welcome_v1",
    );

    const starter = getPaidWelcomeTemplate("starter", {
      billing: {
        amountMinor: 399,
        currency: "eur",
        nextRenewalAt: "2026-10-13T00:00:00.000Z",
        statementDescriptor: "AUTOLISTER AI",
      },
    });
    expect(starter.subject).toBe("Your AutoLister AI Starter plan is active");
    expect(starter.body).toContain("10 listings per day and 75 per month");
    expect(starter.body).toContain("AI-generated titles and descriptions");
    expect(starter.body).toContain("€3.99/month");
    expect(starter.body).toContain("Next renewal: 13 Oct 2026");
    expect(starter.body).toContain("On your card statement: AUTOLISTER AI");
    expect(starter.body).toContain(`href="${BRAND.billingPortalUrl}"`);
    expect(starter.body).toContain(
      `href="mailto:${BRAND.supportEmail}?subject=AutoLister%20AI%20style%20help"`,
    );
    expect(starter.body).not.toContain("everything still editable");
    expect(starter.body).not.toContain("reusable seller notes");
    expect(starter.body).toContain("upgrade options");

    const pro = getPaidWelcomeTemplate("pro");
    expect(pro.subject).toBe("Your AutoLister AI Pro plan is active");
    expect(pro.body).toContain("25 listings per day and 250 per month");
    expect(pro.body).toContain("Phone and batch upload");
    expect(pro.body).toContain("Manage your subscription");
    expect(pro.body).toContain("upgrade options");

    expect(getTemplateIndex().map((template) => template.key)).toContain(
      "business_welcome_v1",
    );
    const business = getPaidWelcomeTemplate("business", {
      billing: {
        amountMinor: 1999,
        currency: "eur",
        nextRenewalAt: "2026-10-13T00:00:00.000Z",
        statementDescriptor: "AUTOLISTER AI",
      },
    });
    expect(business.subject).toBe("Your AutoLister AI Business plan is active");
    expect(business.body).toContain("Your Business plan is active.");
    expect(business.body).toContain("60 listings per day and 600 per month");
    expect(business.body).toContain("Phone and batch upload");
    expect(business.body).toContain("Want listings to sound like your shop?");
    expect(business.body).toContain(
      "Email me an example or the details you want included.",
    );
    expect(business.body).toContain(
      "Need higher limits? Tell me about how many listings you make.",
    );
    expect(business.body).toContain("Founder, AutoLister AI");
    expect(business.body).toContain("€19.99/month");
    expect(business.body).toContain("Next renewal: 13 Oct 2026");
    expect(business.body).toContain("Manage your subscription");
    expect(business.body).not.toContain("upgrade options");
    expect(business.body).not.toContain("reusable seller notes");
    expect(business.body).not.toContain("everything still editable");
    expect(business.body).not.toContain("Welcome to AutoLister AI Business.");
    expect(business.body).not.toContain("background-color: #111827");
    expect(business.body).not.toContain("Manage subscription</a>");
    expect(business.body).toContain("Manage your subscription</a>");
  });

  it("uses legacy paid limits and omits uncertain billing claims", () => {
    const legacy = getPaidWelcomeTemplate("business", { isLegacyPlan: true });

    expect(legacy.body).toContain("75 listings per day and 1,500 per month");
    expect(legacy.body).not.toContain("60 listings per day and 600 per month");
    expect(legacy.body).not.toContain("Next renewal:");
    expect(legacy.body).not.toContain("undefined");
    expect(legacy.body).not.toContain("€19.99/month");
  });

  it("keeps static paid template entries aligned with the dynamic renderer", () => {
    expect(TEMPLATES.starter_welcome_v1).toBeDefined();
    expect(TEMPLATES.pro_welcome_v1).toBeDefined();
    expect(TEMPLATES.business_welcome_v1).toBeDefined();
    expect(TEMPLATES.business_welcome_v1.body).toContain(
      "Manage your subscription",
    );
  });

  it("does not reintroduce verbose onboarding copy", () => {
    const body = getPaidWelcomeTemplate("business").body;
    expect(body).not.toContain("What to do first");
    expect(body).not.toContain("Open AutoLister AI");
    expect(body).not.toContain("everything still editable");
  });

  it("adds dark-mode contrast styles to direct paid welcome emails", () => {
    const template = getPaidWelcomeTemplate("business");
    const html = wrapDirectReplyLayout(template.body, template.preheader);

    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain(".autolister-direct-brand");
    expect(html).toContain(".autolister-direct-link");
    expect(html).toContain("color: #c58af9 !important");
  });

  it("labels isolated admin preview billing as sample data", () => {
    const preview = getPaidWelcomeTemplate("business", {
      billing: {
        amountMinor: 1999,
        currency: "eur",
        nextRenewalAt: "2026-10-13T00:00:00.000Z",
        statementDescriptor: "AUTOLISTER AI",
        sample: true,
      },
    });

    expect(preview.body).toContain("Billing (SAMPLE)");
    expect(preview.body).toContain("€19.99/month (SAMPLE)");
    expect(preview.body).toContain("Next renewal: 13 Oct 2026 (SAMPLE)");
  });

  it("does not claim generic limits for a custom Business plan without entitlements", () => {
    const custom = getPaidWelcomeTemplate("business", {
      isCustomPlan: true,
    });

    expect(custom.body).toContain("Your custom Business limits are active");
    expect(custom.body).not.toContain("60 listings per day and 600 per month");
  });

  it("renders the actual limits granted to a custom Business plan", () => {
    const custom = getPaidWelcomeTemplate("business", {
      isCustomPlan: true,
      limits: { daily: 100, monthly: 1000 },
    });

    expect(custom.body).toContain("100 listings per day and 1,000 per month");
    expect(custom.body).not.toContain("60 listings per day and 600 per month");
  });
});
