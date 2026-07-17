const REMOTE_IMAGE_MAX_BYTES = 8_000_000;

function getAllowedSupabaseHost() {
  try {
    return new URL(process.env.VERCEL_APP_SUPABASE_URL || "").hostname;
  } catch {
    return "";
  }
}

function isAllowedRemoteImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const supabaseHost = getAllowedSupabaseHost();
  return (
    url.protocol === "https:" &&
    (url.hostname.endsWith(".vinted.net") ||
      url.hostname === supabaseHost ||
      url.hostname.endsWith(".supabase.co"))
  );
}

function isDataImageUrl(value: string) {
  return /^data:image\/[^;,]+;base64,/i.test(value);
}

async function remoteImageUrlToDataUrl(
  imageUrl: string,
  fetchImpl: typeof fetch,
) {
  if (!isAllowedRemoteImageUrl(imageUrl)) {
    throw new Error("Invalid image URL: unsupported image host.");
  }

  const response = await fetchImpl(imageUrl, {
    headers: { Accept: "image/*" },
  });
  if (!response.ok) {
    throw new Error(
      `Invalid image URL: image fetch failed (${response.status}).`,
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!contentType?.startsWith("image/")) {
    throw new Error("Invalid image URL: fetched content is not an image.");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (
    !arrayBuffer.byteLength ||
    arrayBuffer.byteLength > REMOTE_IMAGE_MAX_BYTES
  ) {
    throw new Error("Invalid image URL: image is empty or too large.");
  }

  return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

export async function prepareOpenAIImageUrls(
  imageUrls: string[],
  fetchImpl: typeof fetch = fetch,
) {
  return Promise.all(
    imageUrls.map((imageUrl) => {
      if (isDataImageUrl(imageUrl)) return Promise.resolve(imageUrl);
      return remoteImageUrlToDataUrl(imageUrl, fetchImpl);
    }),
  );
}
