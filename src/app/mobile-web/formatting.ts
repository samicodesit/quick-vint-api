import type { BrowserStorageAdapter } from "./language";

export type DescriptionLength = "short" | "long";

export interface FormattingPreferences {
  descriptionLength: DescriptionLength;
  useBulletPoints: boolean;
}

export const DESCRIPTION_LENGTH_STORAGE_KEY = "descriptionLength";
export const OUTPUT_SHAPE_STORAGE_KEY = "useBulletPoints";

export function readFormattingPreferences(
  storage: BrowserStorageAdapter,
): FormattingPreferences {
  return {
    descriptionLength:
      storage.getItem(DESCRIPTION_LENGTH_STORAGE_KEY) === "long"
        ? "long"
        : "short",
    useBulletPoints: storage.getItem(OUTPUT_SHAPE_STORAGE_KEY) !== "false",
  };
}

export function serializeFormattingPreferences(
  preferences: FormattingPreferences,
): FormattingPreferences {
  return {
    descriptionLength:
      preferences.descriptionLength === "short" ? "short" : "long",
    useBulletPoints: Boolean(preferences.useBulletPoints),
  };
}

export function persistFormattingPreferences(
  storage: BrowserStorageAdapter,
  preferences: FormattingPreferences,
): FormattingPreferences {
  const serialized = serializeFormattingPreferences(preferences);
  storage.setItem(DESCRIPTION_LENGTH_STORAGE_KEY, serialized.descriptionLength);
  storage.setItem(OUTPUT_SHAPE_STORAGE_KEY, String(serialized.useBulletPoints));
  return serialized;
}
