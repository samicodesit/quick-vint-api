import { describe, expect, it } from "vitest";
import {
  getInvoiceSubscriptionId,
  getPaidSubscriptionPeriod,
} from "../subscriptionInvoice";

describe("paid subscription invoice periods", () => {
  it("reads the current Stripe invoice parent and recurring service period", () => {
    const invoice = {
      parent: {
        subscription_details: { subscription: "sub_monthly" },
      },
      lines: {
        data: [
          {
            parent: {
              subscription_item_details: { proration: false },
            },
            period: { start: 1785542400, end: 1788220800 },
          },
        ],
      },
    };

    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_monthly");
    expect(getPaidSubscriptionPeriod(invoice)).toEqual({
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
    });
  });

  it("supports the legacy invoice subscription field", () => {
    expect(
      getInvoiceSubscriptionId({ subscription: { id: "sub_legacy" } }),
    ).toBe("sub_legacy");
  });

  it("does not treat a proration-only invoice as a new usage period", () => {
    expect(
      getPaidSubscriptionPeriod({
        lines: {
          data: [
            {
              parent: {
                subscription_item_details: { proration: true },
              },
              period: { start: 1786752000, end: 1788220800 },
            },
          ],
        },
      }),
    ).toBeNull();
  });
});
