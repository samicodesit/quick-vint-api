export function parseOpenAIListingOutput(content: string) {
  const parsed = JSON.parse(content);
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const description =
    typeof parsed.description === "string" ? parsed.description.trim() : "";

  if (!title || !description) {
    throw new Error("OpenAI returned empty listing fields");
  }

  if (
    title.toLowerCase() === "untitled" ||
    description.toLowerCase() === "no description available."
  ) {
    throw new Error("OpenAI returned placeholder listing fields");
  }

  return { title, description };
}
