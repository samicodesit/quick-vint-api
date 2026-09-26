export function escapeSpreadsheetCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportImportRows(
  rows: Array<{
    row_number: number;
    status: string;
    reason: string | null;
    item_id: string | null;
    raw_values: Record<string, unknown>;
    mapped_values: Record<string, unknown>;
  }>,
) {
  const headings = [
    "row",
    "status",
    "reason",
    "item_id",
    "sku",
    "external_id",
    "title",
    "cost_minor",
    "currency",
    "location",
    "sale_state",
    "source",
    "image_url",
    "raw_values",
  ];
  return (
    [
      headings,
      ...rows.map((row) => [
        row.row_number,
        row.status,
        row.reason,
        row.item_id,
        row.mapped_values.sku,
        row.mapped_values.externalId,
        row.mapped_values.title,
        row.mapped_values.costMinor,
        row.mapped_values.currency,
        row.mapped_values.location,
        row.mapped_values.saleState,
        row.mapped_values.source,
        row.mapped_values.imageUrl,
        JSON.stringify(row.raw_values),
      ]),
    ]
      .map((cells) => cells.map(escapeSpreadsheetCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
