import {
  readListingTextVariants,
  type ListingTextVariants,
} from "./listingTextVariants";

const NO_ITEM_VISIBLE_OUTPUT = {
  title: "Item not visible",
  description:
    "I can't identify a clear item from this photo. Please try another photo where the item is visible.",
};

export function parseOpenAIListingOutput(
  content: string,
  preferredLength?: "short" | "long",
): { title: string; description: string } & ListingTextVariants {
  const parsed = JSON.parse(content);
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const variants = preferredLength ? readListingTextVariants(parsed) : {};
  const preferredDescription =
    preferredLength === "short"
      ? variants.shortDescription
      : variants.longDescription;
  const description =
    preferredDescription ??
    (typeof parsed.description === "string" ? parsed.description.trim() : "");

  if (!title || !description) {
    return NO_ITEM_VISIBLE_OUTPUT;
  }

  if (
    title.toLowerCase() === "untitled" ||
    description.toLowerCase() === "no description available."
  ) {
    return NO_ITEM_VISIBLE_OUTPUT;
  }

  if (title.toLowerCase() === "item not visible") return { title, description };
  return { title, description, ...variants };
}
