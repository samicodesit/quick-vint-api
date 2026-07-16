const NO_ITEM_VISIBLE_OUTPUT = {
  title: "Item not visible",
  description:
    "I can't identify a clear item from this photo. Please try another photo where the item is visible.",
};

export function parseOpenAIListingOutput(content: string) {
  const parsed = JSON.parse(content);
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const description =
    typeof parsed.description === "string" ? parsed.description.trim() : "";

  if (!title || !description) {
    return NO_ITEM_VISIBLE_OUTPUT;
  }

  if (
    title.toLowerCase() === "untitled" ||
    description.toLowerCase() === "no description available."
  ) {
    return NO_ITEM_VISIBLE_OUTPUT;
  }

  return { title, description };
}
