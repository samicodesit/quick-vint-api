import { expect, it } from "vitest";
import * as display from "../pricingDisplay";

it("formats per-listing costs without hiding the differences between monthly plans", () => {
  expect(typeof (display as any).formatUnitPrice).toBe("function");
  const format = (display as any).formatUnitPrice;
  expect([
    format(3.99, 75, "en"),
    format(9.99, 250, "en"),
    format(19.99, 600, "en"),
  ]).toEqual(["€0.053", "€0.040", "€0.033"]);
  expect([
    format(5.99, 20, "en"),
    format(9.99, 50, "en"),
    format(16.99, 100, "en"),
  ]).toEqual(["€0.30", "€0.20", "€0.17"]);
  expect(format(3.99, 75, "de")).toBe("0,053 €");
});
