import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readUninstallPage() {
  return readFileSync(join(process.cwd(), "src/pages/uninstall.astro"), "utf8");
}

function readUiComponentsPage() {
  return readFileSync(
    join(process.cwd(), "src/pages/ui-components.astro"),
    "utf8",
  );
}

function readPricingScript() {
  return readFileSync(join(process.cwd(), "src/scripts/pricing.js"), "utf8");
}

describe("uninstall page winback character", () => {
  it("renders an optimized character asset around the coupon offer", () => {
    const html = readUninstallPage();

    expect(html).toContain('class="offer-visual"');
    expect(html).toContain('src="/uninstall-winback-character.webp"');
    expect(html).toContain('class="brand-logo" src="/logo.svg"');
    expect(html).toContain('class="offer-hero"');
    expect(html).toContain('class="offer-copy"');
    expect(html).toContain('class="coupon-wrap"');
    expect(html).toContain("data-coupon-code>{couponCode}</span>");
    expect(html).toContain('class="proof-footer"');
    expect(html).toContain('class="tier-toggle"');
    expect(html).toContain('data-tier-option="starter"');
    expect(html).toContain('data-tier-option="pro"');
    expect(html).toContain('data-tier-option="business"');
    expect(html).toContain("checkout_plan=starter");
    expect(html).toContain("checkout_plan=pro");
    expect(html).toContain("checkout_plan=business");
    expect(html).toContain('data-tier-proof="proofOneValue"');
    expect(html).toContain("clear: both");
    expect(html).not.toContain("data-copy-code");
    expect(html).not.toContain("copy-code");
    expect(html).toContain('class="offer-visual" aria-hidden="true"');
    expect(html).toContain("width: min(100%, 440px)");
    expect(html).toContain("width: 142px");
    expect(html).toContain("uninstallCharacterIn");
    expect(html).toContain("offerVisualFloat");
    expect(html).toContain("offer-visual img");
    expect(html).not.toContain("couponBreath");
    expect(html).not.toContain("codeFocus");
    expect(html).not.toContain("offerPlateDrift");
    expect(html).not.toContain("valueGlow");
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps the uninstall page available from the local UI preview hub", () => {
    const html = readUiComponentsPage();

    expect(html).toContain("Uninstall Winback Page");
    expect(html).toContain("/uninstall?preview=1");
  });

  it("uses short seller-focused offer copy and compact proof points", () => {
    const html = readUninstallPage();

    expect(html).toContain(
      "Do you really want to do all the manual work yourself?",
    );
    expect(html).toContain("it is a lot cheaper than most AI tools");
    expect(html).toContain("Use this code for 20% off your first month.");
    expect(html).not.toContain("real seller feedback");
    expect(html).not.toContain('class="body-note"');
    expect(html).not.toContain("border-left: 1px dashed");
    expect(html).toContain('class="proof-value"');
    expect(html).toContain('class="proof-label"');
    expect(html).toContain("€3.19");
    expect(html).toContain("Starter first month");
    expect(html).toContain("~82% cheaper");
    expect(html).toContain("than ChatGPT Plus");
    expect(html).toContain("75 listings");
    expect(html).toContain("included on Starter");
    expect(html).toContain("€7.99");
    expect(html).toContain("250 listings");
    expect(html).toContain("€15.99");
    expect(html).toContain("600 listings");
    expect(html).toContain("applyTier");
    expect(html).toContain("getInitialTier");
    expect(html).toContain("uninstall_offer_tier_selected");
    expect(html).toContain("Average 5 seconds");
    expect(html).toContain("from photos to draft");
    expect(html).not.toContain("Title + description");
    expect(html).not.toContain("from item photos");
    expect(html).not.toContain("paste into Vinted");
    expect(html).not.toContain("review, paste, list");
    expect(html).not.toContain("Vinted-ready draft");
    expect(html).toContain('class="proof-strip"');
    expect(html).not.toContain("Works from your listing page");
    expect(html).not.toContain("No Vinted login required");
    expect(html).not.toContain("Secure checkout by Stripe");
    expect(html).not.toContain("Photos to listing text");
    expect(html).toContain("grid-template-columns: repeat(2");
  });

  it("passes tier checkout intent to the existing pricing checkout flow", () => {
    const script = readPricingScript();

    expect(script).toContain("function normalizeCheckoutPlan");
    expect(script).toContain('urlParams.get("checkout_plan")');
    expect(script).toContain("handlePaidPlanSelection(requestedCheckoutPlan");
    expect(script).toContain("document.getElementById(");
    expect(script).toContain("`btn-${requestedCheckoutPlan}`");
  });

  it("opens Stripe checkout directly from the uninstall choose button when uid is available", () => {
    const html = readUninstallPage();

    expect(html).toContain("function openTierCheckout");
    expect(html).toContain('fetch("/api/stripe/create-checkout"');
    expect(html).toContain("userId");
    expect(html).toContain('source: "uninstall_page"');
    expect(html).toContain("couponCode");
    expect(html).toContain("window.location.assign(data.url)");
    expect(html).toContain("window.location.assign(tierChoose.href)");
  });
});
