import { z } from "zod";

export const createCaptureSchema = z
  .object({ itemId: z.string().uuid() })
  .strict();
export const mediaFileSchema = z
  .object({
    clientFileId: z.string().min(1).max(120),
    name: z.string().min(1).max(255),
    mime: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const uploadManifestSchema = z
  .object({
    sessionId: z.string().uuid(),
    files: z.array(mediaFileSchema).min(1).max(200),
  })
  .strict();
export const completeUploadSchema = z
  .object({
    uploadId: z.string().uuid(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const finishCaptureSchema = z
  .object({ sessionId: z.string().uuid() })
  .strict();
export const pairCaptureSchema = z
  .object({ sessionId: z.string().uuid() })
  .strict();
export const reorderMediaSchema = z
  .object({
    itemId: z.string().uuid(),
    orderedIds: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict();
export const retireMediaSchema = z
  .object({ uploadId: z.string().uuid() })
  .strict();
