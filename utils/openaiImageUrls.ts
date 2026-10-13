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

function getImageHostLabel(value: string) {
  try {
    const { hostname } = new URL(value);
    if (hostname.endsWith(".vinted.net")) return "Vinted photo";
    if (
      hostname === getAllowedSupabaseHost() ||
      hostname.endsWith(".supabase.co")
    ) {
      return "uploaded photo";
    }
  } catch {
    // Fall through to the generic label.
  }
  return "photo link";
}

// Raised before the AI call, so admin logs never blame the AI provider for it.
// The message keeps the "Invalid image URL" prefix the endpoint maps to 400.
export class ImagePreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePreparationError";
  }
}

async function remoteImageUrlToDataUrl(
  imageUrl: string,
  fetchImpl: typeof fetch,
  label: string,
) {
  if (!isAllowedRemoteImageUrl(imageUrl)) {
    throw new ImagePreparationError(
      `Invalid image URL: ${label} uses an unsupported image host.`,
    );
  }

  const response = await fetchImpl(imageUrl, {
    headers: { Accept: "image/*" },
  });
  if (!response.ok) {
    throw new ImagePreparationError(
      `Invalid image URL: ${label} (${getImageHostLabel(imageUrl)}) fetch failed (${response.status}).`,
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!contentType?.startsWith("image/")) {
    throw new ImagePreparationError(
      `Invalid image URL: ${label} (${getImageHostLabel(imageUrl)}) is not an image.`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  if (
    !arrayBuffer.byteLength ||
    arrayBuffer.byteLength > REMOTE_IMAGE_MAX_BYTES
  ) {
    throw new ImagePreparationError(
      `Invalid image URL: ${label} (${getImageHostLabel(imageUrl)}) is empty or too large.`,
    );
  }

  return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

export async function prepareOpenAIImageUrls(
  imageUrls: string[],
  fetchImpl: typeof fetch = fetch,
) {
  return Promise.all(
    imageUrls.map((imageUrl, index) => {
      if (isDataImageUrl(imageUrl)) return Promise.resolve(imageUrl);
      const label = `photo ${index + 1} of ${imageUrls.length}`;
      return remoteImageUrlToDataUrl(imageUrl, fetchImpl, label).catch(
        (error) => {
          if (error instanceof ImagePreparationError) throw error;
          // Network failures stay out of the "Invalid" (400) class, and keep
          // the original text so timeouts still map to 504.
          throw new ImagePreparationError(
            `Photo download failed: ${label} (${getImageHostLabel(imageUrl)}): ${error?.message || "network error"}`,
          );
        },
      );
    }),
  );
}

// One line for the admin "Flagged" badge: where the photos came from and,
// when the extension had to use Vinted's page copies, why.
export function summarizePhotoSourcesForLog(imageMetadata: unknown) {
  if (!Array.isArray(imageMetadata) || imageMetadata.length === 0) return null;
  const counts = new Map<string, number>();
  for (const entry of imageMetadata) {
    const metadata =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    const payloadSource =
      typeof metadata.generationPayloadSource === "string"
        ? metadata.generationPayloadSource
        : null;
    const reason =
      typeof metadata.capturedUploadMatchStatus === "string"
        ? metadata.capturedUploadMatchStatus
        : null;
    const label =
      metadata.promptSource === "vinted_dom_image"
        ? `vinted_page_photo${reason ? ` (${reason})` : ""}${
            payloadSource ? ` via ${payloadSource}` : ""
          }`
        : payloadSource ||
          (typeof metadata.promptSource === "string"
            ? metadata.promptSource
            : "unknown");
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts, ([label, count]) => `${count}x ${label}`)
    .join(", ")
    .slice(0, 300);
}
