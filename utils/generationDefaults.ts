export type DescriptionLength = "short" | "long";

export const DEFAULT_DESCRIPTION_LENGTH: DescriptionLength = "long";

export function normalizeDescriptionLength(value: unknown): DescriptionLength {
  return value === "short" || value === "long"
    ? value
    : DEFAULT_DESCRIPTION_LENGTH;
}
