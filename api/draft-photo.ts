import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";
import { isAllowedAppOrigin } from "../utils/allowedOrigins";
import {
  DRAFT_BUCKET,
  DraftError,
  draftsEnabled,
  handleDraftAction,
  mutateDraft,
  ownedPhoto,
} from "../utils/listingDrafts";
import {
  DRAFT_LIMITS,
  validDraftId,
} from "../src/app/mobile-web/draftContracts";

export const config = { api: { bodyParser: false } };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!isAllowedAppOrigin(req.headers.origin))
    return res.status(403).json({ error: "Origin not allowed." });
  if (req.headers.origin)
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!draftsEnabled())
    return res
      .status(404)
      .json({ error: "Draft preparation is not enabled yet." });
  if (req.method !== "PUT")
    return res.status(405).json({ error: "Method not allowed." });
  const token =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization.match(/^Bearer\s+(\S+)$/)?.[1]
      : null;
  if (!token)
    return res.status(401).json({ error: "Sign in to upload photos." });
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user)
      return res.status(401).json({ error: "Sign in again to upload photos." });
    if (
      !validDraftId(req.query.photoId) ||
      req.headers["content-type"]?.split(";")[0] !== "image/jpeg"
    )
      throw new DraftError(400, "invalid_photo", "Choose a valid JPEG photo.");
    const photo = await ownedPhoto(user.id, req.query.photoId);
    if (photo.status === "ready")
      return res.status(200).json(
        await handleDraftAction(user.id, "completeUpload", {
          photoId: photo.id,
        }),
      );
    if (!(Date.parse(photo.grant_expires_at) > Date.now()))
      throw new DraftError(
        409,
        "photo_expired",
        "This photo's upload expired. Retry the photo to continue.",
      );
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const part of req) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      length += chunk.length;
      if (length > photo.bytes || length > DRAFT_LIMITS.uploadBytes)
        throw new DraftError(
          400,
          "photo_size",
          "This photo's size does not match its upload. Choose it again.",
        );
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (
      length !== photo.bytes ||
      buffer[0] !== 255 ||
      buffer[1] !== 216 ||
      buffer[2] !== 255 ||
      buffer[length - 2] !== 255 ||
      buffer[length - 1] !== 217
    )
      throw new DraftError(
        400,
        "invalid_photo",
        "This photo could not be verified. Choose it again.",
      );
    const digest = createHash("sha256").update(buffer).digest("hex");
    const stored = await supabase.storage
      .from(DRAFT_BUCKET)
      .upload(photo.object_key, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (stored.error) {
      const existing = await supabase.storage
        .from(DRAFT_BUCKET)
        .download(photo.object_key);
      if (
        existing.error ||
        !existing.data ||
        createHash("sha256")
          .update(Buffer.from(await existing.data.arrayBuffer()))
          .digest("hex") !== digest
      )
        throw new DraftError(
          503,
          "photo_upload_failed",
          "This photo could not be saved. Try again.",
        );
    }
    await mutateDraft(user.id, "completeUpload", {
      photoId: photo.id,
      bytes: length,
      digest,
    });
    return res.status(200).json(
      await handleDraftAction(user.id, "completeUpload", {
        photoId: photo.id,
      }),
    );
  } catch (error) {
    if (error instanceof DraftError)
      return res
        .status(error.status)
        .json({ code: error.code, error: error.message });
    return res.status(503).json({
      code: "photo_upload_failed",
      error: "Your photo could not be saved. Try again.",
    });
  }
}
