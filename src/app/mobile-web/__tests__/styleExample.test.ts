import { expect, it } from "vitest";
import {
  buildExample,
  draftSettingsFromStyle,
  initialStyle,
} from "../styleExample";
import { translations } from "../styleTranslations";
import { SUPPORTED_OUTPUT_LANGUAGES } from "../../../utils/mobileOutputLanguages";
it("covers every supported language with complete UI and shorter wording for the same five details", () => {
  expect(translations.map((t) => t.code)).toEqual(
    SUPPORTED_OUTPUT_LANGUAGES.map((t) => t.code),
  );
  for (const translation of translations) {
    expect(
      Object.values(translation.ui).every((value) => Boolean(value.trim())),
    ).toBe(true);
    const base = {
      ...initialStyle,
      titleLanguage: translation.code,
      descriptionLanguage: translation.code,
    };
    const short = buildExample(base);
    const long = buildExample({ ...base, length: "long" });
    expect(short.details).toHaveLength(5);
    expect(long.details).toHaveLength(5);
    expect(short.details.join(" ").length).toBeLessThan(
      long.details.join(" ").length,
    );
    expect(short.title).toBe(long.title);
    expect(short.note).toBe("");
  }
});
it("keeps title and description languages independent and includes only a supplied seller note", () => {
  const example = buildExample({
    ...initialStyle,
    titleLanguage: "fr",
    descriptionLanguage: "nl",
    note: "My own note",
    includeNote: true,
  });
  expect(example.title).toContain("Robe noire");
  expect(example.intro).toContain("Zwarte Maje");
  expect(example.note).toBe("My own note");
  expect(
    draftSettingsFromStyle({ ...initialStyle, note: "  ", includeNote: true })
      .includeSellerNote,
  ).toBe(false);
});
