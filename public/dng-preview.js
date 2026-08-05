const DEFAULT_CHUNK_SIZE = 512 * 1024;
const MAX_CANDIDATES = 8;
const TIFF_HEADER_BYTES = 128 * 1024;

export async function readTiffOrientation(file) {
  if (!file?.size) return 1;

  try {
    const buffer = await file
      .slice(0, Math.min(file.size, TIFF_HEADER_BYTES))
      .arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 10) return 1;

    const byteOrder = view.getUint16(0, false);
    const littleEndian = byteOrder === 0x4949;
    if (!littleEndian && byteOrder !== 0x4d4d) return 1;
    if (view.getUint16(2, littleEndian) !== 42) return 1;

    const ifdOffset = view.getUint32(4, littleEndian);
    if (ifdOffset + 2 > view.byteLength) return 1;
    const entryCount = view.getUint16(ifdOffset, littleEndian);

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      if (entryOffset + 12 > view.byteLength) break;
      if (
        view.getUint16(entryOffset, littleEndian) === 274 &&
        view.getUint16(entryOffset + 2, littleEndian) === 3
      ) {
        const orientation = view.getUint16(entryOffset + 8, littleEndian);
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
    }
  } catch {
    // Invalid TIFF metadata should fall back to the normal orientation.
  }

  return 1;
}

export async function findEmbeddedJpegCandidates(
  file,
  chunkSize = DEFAULT_CHUNK_SIZE,
) {
  if (!file?.size) return [];

  const size = Math.max(2, Math.floor(chunkSize) || DEFAULT_CHUNK_SIZE);
  const ranges = [];
  let previousByte = null;
  let jpegStart = null;

  for (let offset = 0; offset < file.size; offset += size) {
    const bytes = new Uint8Array(
      await file
        .slice(offset, Math.min(offset + size, file.size))
        .arrayBuffer(),
    );

    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      const absoluteIndex = offset + index;

      if (previousByte === 0xff && byte === 0xd8) {
        jpegStart = absoluteIndex - 1;
      } else if (previousByte === 0xff && byte === 0xd9 && jpegStart !== null) {
        ranges.push({ start: jpegStart, end: absoluteIndex + 1 });
        ranges.sort(
          (left, right) => right.end - right.start - (left.end - left.start),
        );
        if (ranges.length > MAX_CANDIDATES) ranges.pop();
        jpegStart = null;
      }

      previousByte = byte;
    }
  }

  return ranges.map(({ start, end }) => file.slice(start, end, "image/jpeg"));
}

export async function convertDngPreview(file, convertCandidate) {
  if (!file?.size) {
    throw new Error(
      "RAW photo unavailable. Download it to your iPhone and select it again.",
    );
  }

  const orientation = await readTiffOrientation(file);
  for (const candidate of await findEmbeddedJpegCandidates(file)) {
    try {
      return await convertCandidate(candidate, orientation);
    } catch {
      // Lossless JPEG RAW streams are not browser-decodable; try the next JPEG.
    }
  }

  throw new Error(
    "This RAW photo cannot be opened. Export it as JPEG or HEIC and try again.",
  );
}
