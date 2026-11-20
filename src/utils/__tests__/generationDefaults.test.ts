import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESCRIPTION_LENGTH,
  normalizeDescriptionLength,
} from "../../../utils/generationDefaults";
import { DEFAULT_DRAFT_SETTINGS } from "../../app/mobile-web/draftContracts";

describe("description length default", () => {
  it("is long and applies to missing or invalid values", () => {
    expect(DEFAULT_DESCRIPTION_LENGTH).toBe("long");
    for (const value of [undefined, null, "", "medium", 3])
      expect(normalizeDescriptionLength(value)).toBe("long");
    expect(normalizeDescriptionLength("short")).toBe("short");
    expect(normalizeDescriptionLength("long")).toBe("long");
  });

  it("is the default for new web drafts", () => {
    expect(DEFAULT_DRAFT_SETTINGS.descriptionLength).toBe(
      DEFAULT_DESCRIPTION_LENGTH,
    );
  });

  it("matches the default seeded by the listing draft database function", () => {
    const sql = readFileSync(
      "migrations/2026-10-09_listing_drafts.sql",
      "utf8",
    );
    const match = sql.match(/"descriptionLength":"(short|long)"/);
    expect(match?.[1]).toBe(DEFAULT_DESCRIPTION_LENGTH);
  });
});
