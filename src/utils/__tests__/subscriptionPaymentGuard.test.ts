import { describe, expect, it } from "vitest";
import { getUnpaidPlanChangeUpdate } from "../subscriptionPaymentGuard";

const now = Date.parse("2026-10-27T00:00:00Z");
const profile = {
  stripe_subscription_id: "sub_1",
  stripe_customer_id: "cus_1",
  subscription_tier: "pro",
  subscription_status: "active",
  current_period_end: "2026-11-02T00:00:00Z",
  last_usage_period_end: "2026-11-02T00:00:00Z",
  is_legacy_plan: true,
};
const sub = { id: "sub_1", status: "past_due" };
const invoice = {
  subscription: "sub_1",
  customer: "cus_1",
  billing_reason: "subscription_update",
  status: "open",
};

describe("unpaid plan changes", () => {
  it.each(["open", "draft", "void", "uncollectible"])(
    "preserves old paid benefits for a %s upgrade invoice",
    (status) => {
      expect(
        getUnpaidPlanChangeUpdate(profile, sub, { ...invoice, status }, now),
      ).toEqual({
        subscription_tier: "pro",
        subscription_status: "active",
        current_period_end: profile.current_period_end,
        paid_access_expires_at: "2026-11-02T00:00:00.000Z",
        is_legacy_plan: true,
      });
    },
  );
  it("does not extend access beyond the verified paid period", () => {
    expect(
      getUnpaidPlanChangeUpdate(
        { ...profile, last_usage_period_end: "2026-10-02T00:00:00Z" },
        sub,
        invoice,
        now,
      )?.subscription_status,
    ).toBe("past_due");
  });
  it("does not infer payment when its paid-period marker is missing", () => {
    expect(
      getUnpaidPlanChangeUpdate(
        { ...profile, last_usage_period_end: null },
        sub,
        invoice,
        now,
      )?.subscription_status,
    ).toBe("past_due");
  });
  it("retains a scheduled cancellation without revoking the current paid period", () => {
    expect(
      getUnpaidPlanChangeUpdate(
        profile,
        { ...sub, cancel_at_period_end: true },
        invoice,
        now,
      )?.subscription_status,
    ).toBe("canceling");
  });
  it("does not reopen a canceled subscription", () => {
    expect(
      getUnpaidPlanChangeUpdate(
        profile,
        { ...sub, status: "canceled" },
        invoice,
        now,
      )?.subscription_status,
    ).toBe("canceled");
  });
  it("does not disguise a failed renewal as a failed upgrade", () => {
    expect(
      getUnpaidPlanChangeUpdate(
        profile,
        sub,
        { ...invoice, billing_reason: "subscription_cycle" },
        now,
      ),
    ).toBeNull();
  });
  it("allows settled upgrades, including a zero-due invoice", () => {
    expect(
      getUnpaidPlanChangeUpdate(
        profile,
        sub,
        { ...invoice, status: "paid", amount_paid: 0 },
        now,
      ),
    ).toBeNull();
  });
  it.each([{ subscription: "sub_other" }, { customer: "cus_other" }])(
    "rejects invoice ownership mismatches",
    (change) => {
      expect(() =>
        getUnpaidPlanChangeUpdate(profile, sub, { ...invoice, ...change }, now),
      ).toThrow(/does not match/);
    },
  );
});
