import { createHash } from "node:crypto";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { OpsError } from "../core/errors";

const MAX_BYTES = 20 * 1024 * 1024;
export type DecodedImage = {
  checksum: string;
  mime: string;
  bytes: number;
  derivative: Buffer;
};

export function sniffImage(input: Buffer): string | null {
  if (input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (input.toString("ascii", 4, 8) === "ftyp") {
    const brand = input.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand))
      return "image/heic";
  }
  return null;
}

export async function processOriginal(
  input: Buffer,
  declaredMime: string,
): Promise<DecodedImage> {
  if (!input.length || input.length > MAX_BYTES)
    throw new OpsError("VALIDATION", "Photo exceeds the 20 MiB limit");
  const detected = sniffImage(input);
  const equivalentHeif =
    declaredMime === "image/heif" && detected === "image/heic";
  if (!detected || (detected !== declaredMime && !equivalentHeif))
    throw new OpsError(
      "VALIDATION",
      "Photo format does not match its contents",
    );
  let source = input;
  if (detected === "image/heic") {
    try {
      source = Buffer.from(
        await heicConvert({ buffer: input, format: "JPEG", quality: 0.9 }),
      );
    } catch {
      throw new OpsError(
        "VALIDATION",
        "HEIC or HEIF photo could not be decoded",
      );
    }
  }
  try {
    const metadata = await sharp(source, { failOn: "error" }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 100_000_000
    )
      throw new Error("Invalid dimensions");
    // rotate uses EXIF orientation, while the derivative omits source metadata.
    const derivative = await sharp(source)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    return {
      checksum: createHash("sha256").update(input).digest("hex"),
      mime: detected,
      bytes: input.length,
      derivative,
    };
  } catch {
    throw new OpsError("VALIDATION", "Photo could not be decoded");
  }
}
