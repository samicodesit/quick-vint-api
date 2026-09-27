import { expect, it } from "vitest";
import { sortTodayOrders } from "../../../utils/ops/today";

it("orders dated work first, then blocked and ready work without inventing a due date", () => {
  const created_at = "2026-09-27T00:00:00Z";
  const orders = [
    { id: "confirmed", status: "confirmed", created_at, ship_by_at: null },
    { id: "unknown", status: "unknown", created_at, ship_by_at: null },
    {
      id: "later",
      status: "packed",
      created_at,
      ship_by_at: "2026-10-03T12:00:00Z",
    },
    {
      id: "earlier",
      status: "reserved",
      created_at,
      ship_by_at: "2026-10-01T12:00:00Z",
    },
  ];
  expect(sortTodayOrders(orders).map((order) => order.id)).toEqual([
    "earlier",
    "later",
    "unknown",
    "confirmed",
  ]);
  expect(orders[0].id).toBe("confirmed");
});
