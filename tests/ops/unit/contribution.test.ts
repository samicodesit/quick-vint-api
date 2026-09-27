import { describe, expect, it } from "vitest";
import {
  allocateSellerRevenue,
  calculateContribution,
  type OrderSnapshot,
} from "../../../utils/ops/reports/contribution";
import { exportReportCsv } from "../../../utils/ops/reports/ledger";

const order = (cost: number | null, currency = "EUR"): OrderSnapshot => ({
  id: "order-1",
  currency,
  sellerTotalMinor: 6000,
  status: "dispatched",
  lines: [
    {
      id: "line-1",
      itemId: "item-1",
      sellerRevenueMinor: null,
      acquisitionCostMinor: cost,
      acquisitionCurrency: cost === null ? null : currency,
      acquisitionBasis: cost === null ? "unknown" : "sale_snapshot",
    },
  ],
});
describe("contribution accounting", () => {
  it("returns exactly EUR 44 on the specified sale fixture", () => {
    expect(
      calculateContribution(order(1200), [
        { kind: "seller_fee", amountMinor: 300, currency: "EUR" },
        { kind: "packaging", amountMinor: 100, currency: "EUR" },
      ]).contributionMinor,
    ).toBe(4400);
  });
  it("leaves unknown acquisition incomplete while explicit zero remains known", () => {
    expect(calculateContribution(order(null), []).contributionMinor).toBeNull();
    expect(calculateContribution(order(0), []).contributionMinor).toBe(6000);
  });
  it("subtracts a partial refund and keeps currencies separate", () => {
    expect(
      calculateContribution(order(1200), [
        { kind: "refund", amountMinor: 500, currency: "EUR" },
      ]).contributionMinor,
    ).toBe(4300);
    expect(
      calculateContribution(order(1200), [
        { kind: "shipping", amountMinor: 100, currency: "GBP" },
      ]).status,
    ).toBe("incomplete");
  });
  it("allocates a bundle by stable line ID and labels the allocation", () => {
    const bundle: OrderSnapshot = {
      ...order(1200),
      sellerTotalMinor: 6001,
      lines: [
        { ...order(1200).lines[0], id: "b" },
        { ...order(1200).lines[0], id: "a", itemId: "item-2" },
      ],
    };
    expect(allocateSellerRevenue(bundle)).toEqual([
      {
        lineId: "b",
        itemId: "item-1",
        revenueMinor: 3000,
        basis: "equal_allocation",
      },
      {
        lineId: "a",
        itemId: "item-2",
        revenueMinor: 3001,
        basis: "equal_allocation",
      },
    ]);
  });
  it("charges acquisition only once for a resold item", () => {
    expect(
      calculateContribution(order(1200), [], new Set(["item-1"]))
        .contributionMinor,
    ).toBe(6000);
  });
  it("exports the same contribution shown in a report row", () => {
    const calculation = calculateContribution(order(1200), [
      { kind: "seller_fee", amountMinor: 300, currency: "EUR" },
      { kind: "packaging", amountMinor: 100, currency: "EUR" },
    ]);
    const report = {
      from: "2026-09-01",
      to: "2026-09-30",
      allocationRule: "equal",
      currencies: {},
      rows: [
        {
          orderId: "order-1",
          createdAt: "2026-09-26T00:00:00Z",
          orderStatus: "dispatched",
          ...calculation,
        },
      ],
    } as Parameters<typeof exportReportCsv>[0];
    expect(exportReportCsv(report)).toContain(
      '"4400","complete","equal_allocation"',
    );
  });
});
