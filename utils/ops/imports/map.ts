import type { z } from "zod";
import type { importMappingSchema } from "../../../src/ops/contracts/imports";

export type ImportMapping = z.infer<typeof importMappingSchema>;
export type MappedRow = {
  mapped: Record<string, string | number | null>;
  status: "pending" | "invalid" | "unsupported" | "conflicted";
  reason: string | null;
};
const currencies = new Set(
  (
    Intl as typeof Intl & { supportedValuesOf(key: string): string[] }
  ).supportedValuesOf("currency"),
);

export function mapImportRow(
  raw: Record<string, string>,
  mapping: ImportMapping,
): MappedRow {
  const value = (field: keyof ImportMapping["columns"]) => {
    const header = mapping.columns[field];
    return header ? (raw[header] ?? "").trim() : "";
  };
  const mapped: Record<string, string | number | null> = {
    sku: value("sku") || null,
    externalId: value("externalId") || null,
    title: value("title") || null,
    location: value("location") || null,
    source: value("source") || null,
    imageUrl: value("imageUrl") || null,
    saleState: value("saleState") || null,
    costMinor: null,
    currency: null,
  };
  const cost = value("cost");
  const currency = value("currency").toUpperCase();
  if (cost) {
    if (!/^(0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(cost))
      return { mapped, status: "invalid", reason: "Invalid acquisition cost" };
    if (!currencies.has(currency))
      return {
        mapped,
        status: "invalid",
        reason: "Invalid or missing currency",
      };
    const [whole, fraction = ""] = cost.split(".");
    mapped.costMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    mapped.currency = currency;
  } else if (currency) {
    return {
      mapped,
      status: "invalid",
      reason: "Currency supplied without acquisition cost",
    };
  }
  if (mapped.sku && String(mapped.sku).length > 80)
    return { mapped, status: "invalid", reason: "SKU exceeds 80 characters" };
  if (mapped.externalId && String(mapped.externalId).length > 160)
    return {
      mapped,
      status: "invalid",
      reason: "External ID exceeds 160 characters",
    };
  if (
    mapped.saleState &&
    !["draft", "active", "sold", "archived"].includes(
      String(mapped.saleState).toLowerCase(),
    )
  )
    return {
      mapped,
      status: "unsupported",
      reason: "Sale state is not supported",
    };
  if (mapped.saleState)
    mapped.saleState = String(mapped.saleState).toLowerCase();
  if (!mapped.sku && !mapped.externalId && !mapped.title)
    return {
      mapped,
      status: "invalid",
      reason: "Row has no item identifier or title",
    };
  return { mapped, status: "pending", reason: null };
}

export function markInFileConflicts(rows: MappedRow[]): MappedRow[] {
  const skuCounts = new Map<string, number>();
  const extCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "pending") continue;
    const sku = row.mapped.sku && String(row.mapped.sku).toUpperCase();
    const external = row.mapped.externalId && String(row.mapped.externalId);
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (external) extCounts.set(external, (extCounts.get(external) ?? 0) + 1);
  }
  return rows.map((row) => {
    if (row.status !== "pending") return row;
    const sku = row.mapped.sku && String(row.mapped.sku).toUpperCase();
    const external = row.mapped.externalId && String(row.mapped.externalId);
    if (
      (sku && skuCounts.get(sku)! > 1) ||
      (external && extCounts.get(external)! > 1)
    )
      return {
        ...row,
        status: "conflicted",
        reason: "Identifier repeats within this CSV",
      };
    return row;
  });
}
