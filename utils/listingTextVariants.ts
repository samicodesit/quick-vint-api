export type ListingTextVariants = {
  shortTitle?: string;
  shortDescription?: string;
  longDescription?: string;
};

export function readListingTextVariants(value: unknown): ListingTextVariants {
  const variants: ListingTextVariants = {};
  if (!value || typeof value !== "object") return variants;
  for (const field of [
    "shortTitle",
    "shortDescription",
    "longDescription",
  ] as const) {
    const candidate: unknown = Reflect.get(value, field);
    const text = typeof candidate === "string" ? candidate.trim() : "";
    if (text && text.length <= (field === "shortTitle" ? 200 : 10000))
      variants[field] = text;
  }
  return variants;
}
