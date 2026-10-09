import { createHash } from "node:crypto";
import { supabase } from "./supabaseClient";
import {
  DRAFT_LIMITS,
  validDraftId,
  type Draft,
  type DraftPhoto,
} from "../src/app/mobile-web/draftContracts";

export const DRAFT_BUCKET = "listing-drafts";
export class DraftError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function draftsEnabled(): boolean {
  return (
    process.env.MOBILE_WEB_APP_ENABLED === "true" &&
    process.env.LISTING_DRAFTS_ENABLED === "true"
  );
}
function check(error: any): void {
  if (!error) return;
  const code = String(error.message || "").match(
    /draft_conflict|draft_not_found|photo_not_found|photo_conflict|storage_limit|import_limit|draft_limit|photo_limit|photo_size|photos_not_ready|generation_in_progress|generation_commit_pending|operation_conflict|reservation_not_found|invalid_result/,
  )?.[0];
  const messages: Record<string, string> = {
    draft_conflict:
      "This draft changed elsewhere. Reload the saved version before saving.",
    draft_not_found: "This draft is no longer available.",
    photo_not_found: "This photo is no longer available.",
    generation_in_progress:
      "This item is still generating. Check its result before making changes.",
    generation_commit_pending:
      "Your generation is still being saved. Check its result shortly.",
    photos_not_ready: "Wait for this item's photos to finish uploading.",
    storage_limit:
      "Your saved photos have reached 512 MB. Delete unused photos; space is released after scheduled cleanup.",
    draft_limit: "You have 500 saved items. Delete unused items to make space.",
    photo_limit: "One item can have up to 10 photos.",
    import_limit: "One import can have up to 100 photos.",
    photo_size:
      "The prepared photo could not be verified. Try uploading it again.",
  };
  if (code)
    throw new DraftError(
      code.endsWith("not_found") ? 404 : 409,
      code,
      messages[code] || "This item changed. Reload it and try again.",
    );
  throw new DraftError(
    503,
    "draft_service_unavailable",
    "Your work could not be saved. Please try again.",
  );
}
export async function mutateDraft(
  userId: string,
  action: string,
  input: Record<string, unknown>,
): Promise<any> {
  const { data, error } = await supabase.rpc("listing_draft_mutate", {
    p_user_id: userId,
    p_action: action,
    p_input: input,
  });
  check(error);
  return data;
}
export async function ownedDraft(userId: string, id: string): Promise<any> {
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  check(error);
  if (!data)
    throw new DraftError(
      404,
      "draft_not_found",
      "This draft is no longer available.",
    );
  return data;
}
export async function ownedPhoto(userId: string, id: string): Promise<any> {
  const { data, error } = await supabase
    .from("listing_draft_photos")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  check(error);
  if (!data)
    throw new DraftError(
      404,
      "photo_not_found",
      "This photo is no longer available.",
    );
  return data;
}
export async function draftPhotos(
  userId: string,
  draftId?: string,
): Promise<any[]> {
  let query = supabase
    .from("listing_draft_photos")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (draftId) query = query.eq("draft_id", draftId);
  const { data, error } = await query
    .order("position")
    .order("created_at")
    .limit(draftId ? DRAFT_LIMITS.photos : DRAFT_LIMITS.importPhotos);
  check(error);
  return data || [];
}
async function publicPhotos(rows: any[]): Promise<DraftPhoto[]> {
  const ready = rows.filter((p) => p.status === "ready");
  const urls = new Map<string, string>();
  if (ready.length) {
    const { data, error } = await supabase.storage
      .from(DRAFT_BUCKET)
      .createSignedUrls(
        ready.map((p) => p.object_key),
        3600,
      );
    check(error);
    for (const row of data || [])
      if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
    if (urls.size !== ready.length)
      throw new DraftError(
        503,
        "photo_signing_unavailable",
        "Your photos could not be loaded. Try again.",
      );
  }
  return rows.map((p) => ({
    id: p.id,
    import_id: p.import_id,
    draft_id: p.draft_id,
    position: p.position,
    bytes: p.bytes,
    status: p.status,
    created_at: p.created_at,
    ...(urls.has(p.object_key) ? { url: urls.get(p.object_key) } : {}),
  }));
}
export function publicDraft(row: any, photos: DraftPhoto[] = []): Draft {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    settings: row.settings,
    state: row.state,
    version: row.version,
    input_version: row.input_version,
    operation_id: row.operation_id,
    operation_state: row.operation_state,
    updated_at: row.updated_at,
    photos,
  };
}
export async function loadDraft(userId: string, id: string): Promise<Draft> {
  const row = await ownedDraft(userId, id);
  return publicDraft(row, await publicPhotos(await draftPhotos(userId, id)));
}
async function listDrafts(userId: string, input: Record<string, any>) {
  let query = supabase
    .from("listing_drafts")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("state", input.state || "draft")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(31);
  if (input.cursor) {
    let cursor: any;
    try {
      cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
    } catch {
      throw new DraftError(400, "invalid_cursor", "Reload your drafts.");
    }
    if (
      !cursor ||
      typeof cursor.created !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
        cursor.created,
      ) ||
      !Number.isFinite(Date.parse(cursor.created)) ||
      typeof cursor.id !== "string" ||
      !validDraftId(cursor.id)
    )
      throw new DraftError(400, "invalid_cursor", "Reload your drafts.");
    query = query.or(
      `created_at.lt.${cursor.created},and(created_at.eq.${cursor.created},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  check(error);
  const rows = (data || []).slice(0, 30);
  const drafts = await Promise.all(
    rows.map(async (row) =>
      publicDraft(row, await publicPhotos(await draftPhotos(userId, row.id))),
    ),
  );
  const { data: imports, error: importError } = await supabase
    .from("listing_draft_photos")
    .select("*")
    .eq("user_id", userId)
    .is("draft_id", null)
    .is("deleted_at", null)
    .order("created_at")
    .limit(100);
  check(importError);
  const last = rows[rows.length - 1];
  return {
    drafts,
    imports: await publicPhotos(imports || []),
    nextCursor:
      (data?.length || 0) > 30
        ? Buffer.from(
            JSON.stringify({ created: last.created_at, id: last.id }),
          ).toString("base64url")
        : null,
  };
}
export async function handleDraftAction(
  userId: string,
  action: string,
  input: Record<string, any>,
): Promise<any> {
  if (action === "list") return listDrafts(userId, input);
  if (action === "detail") return loadDraft(userId, input.draftId);
  if (action === "recover") {
    const { recoverDraftGeneration } = await import("./draftGeneration.js");
    return recoverDraftGeneration(userId, input.draftId);
  }
  if (action === "grant") {
    const photo = await mutateDraft(userId, "grant", input);
    if (photo.status === "ready")
      return { photo: (await publicPhotos([photo]))[0], complete: true };
    return {
      photo: (await publicPhotos([photo]))[0],
      uploadUrl: `/api/draft-photo?photoId=${photo.id}`,
    };
  }
  if (action === "completeUpload") {
    const photo = await ownedPhoto(userId, input.photoId);
    if (photo.status !== "ready") {
      const { data, error } = await supabase.storage
        .from(DRAFT_BUCKET)
        .download(photo.object_key);
      check(error);
      if (
        !data ||
        data.size !== photo.bytes ||
        data.size > DRAFT_LIMITS.uploadBytes ||
        data.type.split(";")[0] !== "image/jpeg"
      )
        throw new DraftError(
          400,
          "photo_size",
          "This photo did not finish uploading. Try again.",
        );
      const buffer = Buffer.from(await data.arrayBuffer());
      if (
        buffer[0] !== 255 ||
        buffer[1] !== 216 ||
        buffer[2] !== 255 ||
        buffer[buffer.length - 2] !== 255 ||
        buffer[buffer.length - 1] !== 217
      )
        throw new DraftError(
          400,
          "invalid_image",
          "Choose a valid photo and try again.",
        );
      await mutateDraft(userId, "completeUpload", {
        photoId: photo.id,
        bytes: buffer.length,
        digest: createHash("sha256").update(buffer).digest("hex"),
      });
    }
    return (await publicPhotos([await ownedPhoto(userId, photo.id)]))[0];
  }
  const result = await mutateDraft(userId, action, input);
  if (action === "delete" || action === "removePhoto") {
    try {
      const { data, error } = await supabase
        .from("listing_draft_photos")
        .select("object_key")
        .eq("user_id", userId)
        .not("deleted_at", "is", null)
        .limit(100);
      check(error);
      if (data?.length) {
        const removal = await supabase.storage
          .from(DRAFT_BUCKET)
          .remove(data.map((p) => p.object_key));
        check(removal.error);
      }
    } catch {
      // The deletion is committed; durable tombstones keep Storage cleanup retryable.
      console.warn("Draft photo removal deferred to scheduled cleanup.");
    }
    return { deleted: true };
  }
  return loadDraft(userId, result.id);
}
export async function cleanupDraftPhotos(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("listing_draft_photos")
    .select("id,user_id,object_key,status,deleted_at,grant_expires_at")
    .lt("grant_expires_at", cutoff)
    .or(
      `user_id.is.null,deleted_at.not.is.null,and(status.eq.pending,created_at.lt.${cutoff})`,
    )
    .order("grant_expires_at")
    .limit(100);
  if (error?.code === "42P01" || error?.code === "PGRST205") return 0;
  check(error);
  if (!data?.length) return 0;
  const removable = [];
  for (const photo of data) {
    if (photo.user_id && photo.status === "pending" && !photo.deleted_at) {
      await mutateDraft(photo.user_id, "expireUpload", {
        photoId: photo.id,
        cutoff,
      });
      continue;
    }
    removable.push(photo);
  }
  if (!removable.length) return 0;
  const removed = await supabase.storage
    .from(DRAFT_BUCKET)
    .remove(removable.map((p) => p.object_key));
  check(removed.error);
  // Retain young tombstones so an in-flight upload is removed on a later sweep.
  const old = removable.map((p) => p.id);
  if (old.length) {
    const deletion = await supabase
      .from("listing_draft_photos")
      .delete()
      .in("id", old);
    check(deletion.error);
  }
  return removable.length;
}
