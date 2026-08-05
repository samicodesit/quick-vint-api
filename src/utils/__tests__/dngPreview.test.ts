import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function loadScanner() {
  const url = pathToFileURL(join(process.cwd(), "public/dng-preview.js")).href;
  return import(/* @vite-ignore */ url);
}

function jpeg(payload: number[]) {
  return Uint8Array.from([0xff, 0xd8, ...payload, 0xff, 0xd9]);
}

describe("DNG embedded JPEG scanner", () => {
  it("finds markers split across chunks and returns larger previews first", async () => {
    const { findEmbeddedJpegCandidates } = await loadScanner();
    const small = jpeg([1, 2]);
    const large = jpeg([3, 4, 5, 6, 7]);
    const file = new Blob([
      Uint8Array.from([9, 9]),
      small,
      Uint8Array.from([8]),
      large,
    ]);

    const candidates = await findEmbeddedJpegCandidates(file, 3);

    expect(candidates.map((candidate: Blob) => candidate.size)).toEqual([
      large.length,
      small.length,
    ]);
    expect(
      Array.from(new Uint8Array(await candidates[0].arrayBuffer())),
    ).toEqual(Array.from(large));
  });

  it("ignores unfinished JPEG data and empty files", async () => {
    const { findEmbeddedJpegCandidates } = await loadScanner();
    const unfinished = new Blob([Uint8Array.from([0xff, 0xd8, 1, 2, 3])]);

    expect(await findEmbeddedJpegCandidates(unfinished, 2)).toEqual([]);
    expect(await findEmbeddedJpegCandidates(new Blob([]), 2)).toEqual([]);
  });

  it("retains only the eight largest candidates", async () => {
    const { findEmbeddedJpegCandidates } = await loadScanner();
    const images = Array.from({ length: 12 }, (_, index) =>
      jpeg(Array(index + 1).fill(index)),
    );

    const candidates = await findEmbeddedJpegCandidates(new Blob(images), 5);

    expect(candidates).toHaveLength(8);
    expect(candidates.map((candidate: Blob) => candidate.size)).toEqual([
      16, 15, 14, 13, 12, 11, 10, 9,
    ]);
  });

  it("reads little-endian and big-endian DNG orientation", async () => {
    const { readTiffOrientation } = await loadScanner();
    const littleEndian = Uint8Array.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01,
      0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00,
    ]);
    const bigEndian = Uint8Array.from([
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12,
      0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00,
    ]);

    expect(await readTiffOrientation(new Blob([littleEndian]))).toBe(6);
    expect(await readTiffOrientation(new Blob([bigEndian]))).toBe(8);
    expect(await readTiffOrientation(new Blob([Uint8Array.from([1, 2])]))).toBe(
      1,
    );
  });

  it("converts the first decodable embedded preview without returning RAW data", async () => {
    const { convertDngPreview } = await loadScanner();
    const small = jpeg([1, 2]);
    const large = jpeg([3, 4, 5, 6]);
    const dng = new Blob([large, small], { type: "image/x-adobe-dng" });

    const orientations: number[] = [];
    const result = await convertDngPreview(
      dng,
      async (candidate: Blob, orientation: number) => {
        orientations.push(orientation);
        if (candidate.size === large.length) throw new Error("not decodable");
        return new Blob([candidate], { type: "image/jpeg" });
      },
    );

    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(small.length);
    expect(orientations).toEqual([1, 1]);
  });

  it("rejects empty or previewless DNG files instead of uploading the RAW file", async () => {
    const { convertDngPreview } = await loadScanner();

    await expect(
      convertDngPreview(new Blob([]), async (candidate: Blob) => candidate),
    ).rejects.toThrow(
      "RAW photo unavailable. Download it to your iPhone and select it again.",
    );
    await expect(
      convertDngPreview(
        new Blob([Uint8Array.from([1, 2, 3])]),
        async (candidate: Blob) => candidate,
      ),
    ).rejects.toThrow(
      "This RAW photo cannot be opened. Export it as JPEG or HEIC and try again.",
    );
  });
});
