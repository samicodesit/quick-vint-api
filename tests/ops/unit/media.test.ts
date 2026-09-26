import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { processOriginal, sniffImage } from "../../../utils/ops/media/image";

describe("T05 photo processing", () => {
  it("verifies real JPEG/PNG/WebP bytes, checksum and metadata-free derivative", async () => {
    for (const [format, mime] of [
      ["jpeg", "image/jpeg"],
      ["png", "image/png"],
      ["webp", "image/webp"],
    ] as const) {
      const original = await sharp({
        create: { width: 8, height: 5, channels: 3, background: "red" },
      })
        .toFormat(format)
        .toBuffer();
      expect(sniffImage(original)).toBe(mime);
      const processed = await processOriginal(original, mime);
      expect(processed.checksum).toBe(
        createHash("sha256").update(original).digest("hex"),
      );
      expect(processed.bytes).toBe(original.length);
      expect((await sharp(processed.derivative).metadata()).format).toBe(
        "webp",
      );
      await expect(processOriginal(original, "image/heic")).rejects.toThrow(
        /format does not match/,
      );
    }
  });
  it("rejects corrupt HEIC and unsupported content with a clear error", async () => {
    const fakeHeic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(40),
    ]);
    expect(sniffImage(fakeHeic)).toBe("image/heic");
    await expect(processOriginal(fakeHeic, "image/heic")).rejects.toThrow(
      /could not be decoded/,
    );
    await expect(
      processOriginal(Buffer.from("not an image"), "image/jpeg"),
    ).rejects.toThrow(/format/);
  });
});
