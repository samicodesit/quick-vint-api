import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplateIndex } from "../../../utils/emailTemplates";

describe("email templates", () => {
  it("includes a Starter welcome email matching the redesigned plan template", () => {
    expect(getTemplateIndex().map((template) => template.key)).toContain(
      "starter_welcome_v1",
    );
    expect(TEMPLATES.starter_welcome_v1.subject).toBe(
      "Welcome to Starter - your plan is active",
    );
    expect(TEMPLATES.starter_welcome_v1.preheader).toContain(
      "higher limits",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "Your Starter plan is active.",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain("10 listings per day");
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "75 listings per month",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "AI-generated titles and descriptions",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain("priority support");
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "Ask about higher limits",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "I can share a discount for upgrading",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "I can also help adjust the AI",
    );
    expect(TEMPLATES.starter_welcome_v1.body).toContain(
      "Sami<br />Founder AutoLister AI",
    );
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain(
      "specific details you always want mentioned",
    );
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain(
      "things the AI should pay attention to",
    );
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain(
      "choose the right plan",
    );
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain("if a discount");
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain("phone upload");
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain("batch upload");
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain(
      "reusable seller notes",
    );
    expect(TEMPLATES.starter_welcome_v1.body).not.toContain("What to do first");
  });

  it("includes a Pro welcome email without onboarding trial copy", () => {
    expect(getTemplateIndex().map((template) => template.key)).toContain(
      "pro_welcome_v1",
    );
    expect(TEMPLATES.pro_welcome_v1.subject).toBe(
      "Welcome to Pro - your plan is active",
    );
    expect(TEMPLATES.pro_welcome_v1.body).toContain("Your Pro plan is active.");
    expect(TEMPLATES.pro_welcome_v1.body).toContain("25 listings per day");
    expect(TEMPLATES.pro_welcome_v1.body).toContain("250 listings per month");
    expect(TEMPLATES.pro_welcome_v1.body).toContain("phone upload");
    expect(TEMPLATES.pro_welcome_v1.body).toContain("batch upload");
    expect(TEMPLATES.pro_welcome_v1.body).toContain(
      "Reply with your preferred style",
    );
    expect(TEMPLATES.pro_welcome_v1.body).toContain(
      "If you want the AI to behave in a custom way",
    );
    expect(TEMPLATES.pro_welcome_v1.body).toContain(
      "specific details you always want mentioned",
    );
    expect(TEMPLATES.pro_welcome_v1.body).toContain(
      "Sami<br />Founder AutoLister AI",
    );
    expect(TEMPLATES.pro_welcome_v1.body).not.toContain("Create a listing");
    expect(TEMPLATES.pro_welcome_v1.body).not.toContain("What to do first");
    expect(TEMPLATES.pro_welcome_v1.body).not.toContain("shorter text");
    expect(TEMPLATES.pro_welcome_v1.body).not.toContain("fewer emojis");
    expect(TEMPLATES.pro_welcome_v1.body).not.toContain(
      "how you describe condition or measurements",
    );
    expect(TEMPLATES.pro_welcome_v1.body).not.toContain("Open AutoLister AI");
  });

  it("includes a Business welcome email matching the redesigned plan template", () => {
    expect(getTemplateIndex().map((template) => template.key)).toContain(
      "business_welcome_v1",
    );
    expect(TEMPLATES.business_welcome_v1.subject).toBe(
      "Welcome to Business - your plan is active",
    );
    expect(TEMPLATES.business_welcome_v1.body).toContain(
      "Your Business plan is active.",
    );
    expect(TEMPLATES.business_welcome_v1.body).toContain("60 listings per day");
    expect(TEMPLATES.business_welcome_v1.body).toContain(
      "600 listings per month",
    );
    expect(TEMPLATES.business_welcome_v1.body).toContain("phone upload");
    expect(TEMPLATES.business_welcome_v1.body).toContain("batch upload");
    expect(TEMPLATES.business_welcome_v1.body).toContain(
      "Reply with your preferred style",
    );
    expect(TEMPLATES.business_welcome_v1.body).toContain(
      "Sami<br />Founder AutoLister AI",
    );
    expect(TEMPLATES.business_welcome_v1.body).not.toContain(
      "I saw you upgraded to Business",
    );
    expect(TEMPLATES.business_welcome_v1.body).not.toContain(
      "really appreciate it",
    );
    expect(TEMPLATES.business_welcome_v1.body).not.toContain(
      "What to do first",
    );
  });
});
