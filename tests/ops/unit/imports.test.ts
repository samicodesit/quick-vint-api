import { describe, expect, it } from "vitest";
import { parseImportCsv } from "../../../utils/ops/imports/parse";
import {
  mapImportRow,
  markInFileConflicts,
} from "../../../utils/ops/imports/map";
import { exportImportRows } from "../../../utils/ops/imports/export";

const mapping = {
  columns: {
    sku: "SKU",
    externalId: "Listing ID",
    title: "Title",
    cost: "Cost",
    currency: "Currency",
  },
  accountScope: "vinted-main",
};
describe("T06 CSV mapping", () => {
  it("parses 4,000 rows with optional cost and location", () => {
    const body = [
      "SKU,Listing ID,Title,Cost,Currency",
      ...Array.from(
        { length: 4000 },
        (_, index) => `S-${index},,Item ${index},,`,
      ),
    ].join("\n");
    const parsed = parseImportCsv(body);
    expect(parsed.rows).toHaveLength(4000);
    expect(mapImportRow(parsed.rows[0], mapping)).toMatchObject({
      status: "pending",
      mapped: { costMinor: null, location: null },
    });
  });
  it("preserves explicit zero, rejects invalid money, and spots in-file identifiers", () => {
    expect(
      mapImportRow({ SKU: "A", Cost: "0", Currency: "EUR" }, mapping).mapped
        .costMinor,
    ).toBe(0);
    expect(
      mapImportRow({ SKU: "A", Cost: "1.234", Currency: "EUR" }, mapping)
        .status,
    ).toBe("invalid");
    expect(
      mapImportRow({ SKU: "A", Cost: "1.20", Currency: "ZZZ" }, mapping).status,
    ).toBe("invalid");
    const rows = markInFileConflicts([
      mapImportRow({ SKU: "A" }, mapping),
      mapImportRow({ SKU: "a" }, mapping),
    ]);
    expect(rows.map((row) => row.status)).toEqual(["conflicted", "conflicted"]);
  });
  it("escapes spreadsheet formulas and keeps raw source values in result exports", () => {
    const csv = exportImportRows([
      {
        row_number: 1,
        status: "conflicted",
        reason: "=IMPORT()",
        item_id: null,
        raw_values: { Title: "+cmd" },
        mapped_values: { title: "@user" },
      },
    ]);
    expect(csv).toContain('"\'=IMPORT()"');
    expect(csv).toContain('"\'@user"');
    expect(csv).toContain("+cmd");
  });
});
