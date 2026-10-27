import { describe, expect, it } from "vitest";
import { getMobilePaywall } from "../paywallPolicy";
import type { MobileUsage } from "../generationClient";

const usage = (tier: string, blockedReason: string): MobileUsage => ({
  plan: { tier },
  canGenerate: false,
  blockedReason,
});

describe("extension-compatible web paywall rules", () => {
  it("offers all paid plans and a one-time pack after the free trial", () => {
    expect(
      getMobilePaywall(usage("free", "free_lifetime_limit")),
    ).toMatchObject({
      title: "You’ve used all 5 free listings",
      options: ["starter", "pro", "business", "credit_pack"],
    });
  });
  it("uses the requested billing language for the free-limit explanation", () => {
    expect(
      getMobilePaywall(
        usage("free", "free_lifetime_limit"),
        undefined,
        "fr-FR",
      ),
    ).toMatchObject({
      title: "Vous avez utilisé vos 5 annonces gratuites",
      message:
        "Choisissez un forfait ou achetez des crédits sans abonnement pour continuer.",
    });
    expect(
      getMobilePaywall(
        usage("free", "free_lifetime_limit"),
        undefined,
        "unknown",
      )?.title,
    ).toBe("You’ve used all 5 free listings");
  });
  it.each(["daily_limit", "monthly_limit"])(
    "tailors %s to the current paid tier",
    (code) => {
      expect(getMobilePaywall(usage("starter", code))?.options).toEqual([
        "pro",
        "business",
        "credit_pack",
      ]);
      expect(getMobilePaywall(usage("pro", code))?.options).toEqual([
        "business",
        "credit_pack",
      ]);
      expect(getMobilePaywall(usage("business", code))?.options).toEqual([
        "credit_pack",
        "support",
      ]);
    },
  );
  it("keeps paid continuation and account review available for duplicate-trial pauses", () => {
    expect(getMobilePaywall(usage("free", "account_paused"))).toMatchObject({
      title: "Continue with a paid option",
      options: ["starter", "pro", "business", "credit_pack"],
      support: true,
    });
  });
  it("routes a payment failure to existing billing instead of selling another subscription", () => {
    expect(
      getMobilePaywall(usage("free", "payment_required"))?.options,
    ).toEqual(["manage"]);
  });
  it("preserves the extension's Starter recommendation for legacy recurring free limits", () => {
    expect(
      getMobilePaywall({
        ...usage("free", "monthly_limit"),
        nextTier: "starter",
      })?.options,
    ).toEqual(["starter"]);
  });
  it.each([
    "burst_limit",
    "service_unavailable",
    "auth_required",
    "account_inactive",
    "generation_commit_pending",
    "unknown",
  ])("does not sell access for %s", (code) => {
    expect(getMobilePaywall(usage("free", code))).toBeNull();
  });
  it("does not infer exhausted quota from a zero minute allowance or missing reason", () => {
    expect(
      getMobilePaywall({
        plan: { tier: "free" },
        canGenerate: false,
        remaining: { minute: 0, generations: 0 },
      }),
    ).toBeNull();
    expect(
      getMobilePaywall({
        ...usage("free", "free_lifetime_limit"),
        canGenerate: true,
      }),
    ).toBeNull();
  });
  it("shows only plans that unlock paid tone controls", () => {
    expect(getMobilePaywall({ canGenerate: true }, "feature")?.options).toEqual(
      ["pro", "business"],
    );
  });
});
