export function safeChatGPTReturn(value: string | null): string | null {
  if (!value || value.length > 1024) return null;
  try {
    const url = new URL(value, "https://autolister.app");
    if (
      url.origin !== "https://autolister.app" ||
      url.hash ||
      !["/app/chatgpt", "/oauth/consent"].includes(url.pathname)
    )
      return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
