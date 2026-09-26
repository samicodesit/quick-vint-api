import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { OpsError } from "../core/errors";

export type ParsedCsv = {
  sha256: string;
  headers: string[];
  rows: Record<string, string>[];
  text: string;
};
export function parseImportCsv(text: string): ParsedCsv {
  if (Buffer.byteLength(text, "utf8") > 4_000_000)
    throw new OpsError("VALIDATION", "CSV exceeds the 4 MB limit");
  let grid: string[][];
  try {
    grid = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_quotes: false,
      relax_column_count: false,
    });
  } catch {
    throw new OpsError("VALIDATION", "CSV could not be parsed");
  }
  if (grid.length < 2 || grid.length > 20_001)
    throw new OpsError("VALIDATION", "CSV needs 1 to 20,000 data rows");
  const headers = grid[0].map((value) => value.trim());
  if (
    headers.some((value) => !value || value.length > 160) ||
    new Set(headers.map((value) => value.toLowerCase())).size !== headers.length
  )
    throw new OpsError("VALIDATION", "CSV headers must be unique and nonempty");
  return {
    sha256: createHash("sha256").update(text).digest("hex"),
    headers,
    rows: grid
      .slice(1)
      .map((cells) =>
        Object.fromEntries(
          headers.map((header, index) => [header, cells[index] ?? ""]),
        ),
      ),
    text,
  };
}
