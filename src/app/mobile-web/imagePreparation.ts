const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

export type MobileImageErrorCode = "unsupported-heic" | "decode-failed";

export class MobileImagePreparationError extends Error {
  readonly code: MobileImageErrorCode;

  constructor(code: MobileImageErrorCode, message: string) {
    super(message);
    this.name = "MobileImagePreparationError";
    this.code = code;
  }
}

export interface PreparedMobileImage {
  file: File;
  previewUrl: string;
  sourceType: string;
  recoveredOrientation: boolean;
}

interface DecodedImage {
  image: CanvasImageSource & { close?: () => void };
  width: number;
  height: number;
  recoveredOrientation: boolean;
}

function isHeic(file: File): boolean {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function getSourceType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? `image/${extension}` : "image/unknown";
}

function getOutputName(file: File): string {
  const stem = file.name.replace(/\.[^/.]+$/, "") || "photo";
  return `${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
}

async function decodeWithBitmap(file: File): Promise<DecodedImage | null> {
  const decode = (
    globalThis as typeof globalThis & {
      createImageBitmap?: (
        source: ImageBitmapSource,
        options?: ImageBitmapOptions,
      ) => Promise<ImageBitmap>;
    }
  ).createImageBitmap;
  if (!decode) return null;

  try {
    const image = await decode(file, { imageOrientation: "from-image" });
    return {
      image,
      width: image.width,
      height: image.height,
      recoveredOrientation: true,
    };
  } catch {
    try {
      const image = await decode(file);
      return {
        image,
        width: image.width,
        height: image.height,
        recoveredOrientation: false,
      };
    } catch {
      return null;
    }
  }
}

async function decodeWithImageElement(
  file: File,
): Promise<DecodedImage | null> {
  if (typeof document === "undefined" || typeof Image === "undefined")
    return null;
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image decode failed"));
      element.src = sourceUrl;
    });
    return {
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      recoveredOrientation: false,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function constrainDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (!width || !height)
    throw new MobileImagePreparationError(
      "decode-failed",
      "The image dimensions could not be read.",
    );
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encodeJpeg(file: File, decoded: DecodedImage): Promise<File> {
  if (typeof document === "undefined") {
    throw new MobileImagePreparationError(
      "decode-failed",
      "Image preparation is unavailable in this browser.",
    );
  }
  const dimensions = constrainDimensions(decoded.width, decoded.height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context)
    throw new MobileImagePreparationError(
      "decode-failed",
      "The image could not be prepared.",
    );
  context.drawImage(decoded.image, 0, 0, dimensions.width, dimensions.height);
  decoded.image.close?.();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else
          reject(
            new MobileImagePreparationError(
              "decode-failed",
              "The image could not be compressed.",
            ),
          );
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
  return new File([blob], getOutputName(file), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/**
 * Matches the current phone-upload path: 1280px longest edge and JPEG quality
 * 0.8. HEIC is reported as a recovery state when the browser cannot decode it.
 */
export async function prepareMobileImage(
  file: File,
): Promise<PreparedMobileImage> {
  const sourceType = getSourceType(file);
  if (!sourceType.startsWith("image/")) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      sourceType,
      recoveredOrientation: false,
    };
  }

  const decoded =
    (await decodeWithBitmap(file)) || (await decodeWithImageElement(file));
  if (!decoded) {
    throw new MobileImagePreparationError(
      isHeic(file) ? "unsupported-heic" : "decode-failed",
      isHeic(file)
        ? "This HEIC photo could not be decoded on this device. Choose a JPEG or PNG instead."
        : "This photo could not be prepared. Choose another image and try again.",
    );
  }

  const preparedFile = await encodeJpeg(file, decoded);
  return {
    file: preparedFile,
    previewUrl: URL.createObjectURL(preparedFile),
    sourceType,
    recoveredOrientation: decoded.recoveredOrientation,
  };
}

export function revokeMobilePreview(previewUrl: string | undefined): void {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
}

export const MOBILE_IMAGE_DEFAULTS = {
  maxDimension: MAX_IMAGE_DIMENSION,
  jpegQuality: JPEG_QUALITY,
} as const;
