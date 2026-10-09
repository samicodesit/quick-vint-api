import { createHash } from "node:crypto";
import { supabase } from "./supabaseClient";
import { RateLimiter } from "./rateLimiter";
import {
  DRAFT_BUCKET,
  DraftError,
  draftsEnabled,
  draftPhotos,
  loadDraft,
  mutateDraft,
  ownedDraft,
} from "./listingDrafts";
import { validDraftId } from "../src/app/mobile-web/draftContracts";
import type { MobileGenerationResponse } from "./mobileGenerationTypes";

export interface DraftGenerationContext {
  userId: string;
  draftId: string;
  operationId: string;
  hash: string;
}
export async function recoverDraftGeneration(userId: string, draftId: string) {
  let row = await ownedDraft(userId, draftId);
  if (row.operation_state === "running")
    row = await mutateDraft(userId, "recover", { draftId });
  if (
    row.operation_state === "pending" &&
    row.pending_result &&
    row.reservation_id
  ) {
    const committed = await RateLimiter.commitGenerationReservationVerified(
      row.reservation_id,
    );
    if (!committed.ok) {
      if (committed.state === "refunded")
        await mutateDraft(userId, "fail", {
          draftId,
          operationId: row.operation_id,
        });
      else
        throw new DraftError(
          503,
          "generation_commit_pending",
          "Your result is still being saved. Check again shortly; it will not use another generation.",
        );
    } else
      await mutateDraft(userId, "complete", {
        draftId,
        operationId: row.operation_id,
      });
  } else if (
    row.operation_state === "running" &&
    row.reservation_id &&
    (await RateLimiter.getGenerationReservationStatus(row.reservation_id)) ===
      "refunded"
  ) {
    await mutateDraft(userId, "fail", {
      draftId,
      operationId: row.operation_id,
    });
  }
  return loadDraft(userId, draftId);
}
export async function prepareDraftGeneration(
  userId: string,
  input: Record<string, unknown>,
  operationId: string,
): Promise<{
  body?: Record<string, unknown>;
  context?: DraftGenerationContext;
  response?: MobileGenerationResponse;
}> {
  if (!draftsEnabled())
    throw new DraftError(
      404,
      "drafts_disabled",
      "Draft preparation is not enabled yet.",
    );
  if (
    !validDraftId(input.draftId) ||
    !Number.isSafeInteger(input.inputVersion) ||
    Number(input.inputVersion) < 1 ||
    Object.keys(input).some(
      (k) => !["draftId", "inputVersion", "generationMode"].includes(k),
    )
  )
    throw new DraftError(
      400,
      "invalid_draft_request",
      "Reload this item before generating.",
    );
  const draftId = input.draftId;
  const row = await mutateDraft(userId, "claim", {
    draftId,
    inputVersion: input.inputVersion,
    operationId,
  });
  if (!row._claimed) {
    const draft = await recoverDraftGeneration(userId, draftId);
    if (draft.operation_state === "succeeded")
      return {
        response: { title: draft.title, description: draft.description },
      };
    throw new DraftError(
      draft.operation_state === "failed" ? 409 : 503,
      draft.operation_state === "failed"
        ? "generation_retry"
        : "generation_in_progress",
      draft.operation_state === "failed"
        ? "The previous attempt did not finish. You can try generating again."
        : "This item is still generating. Check its result shortly.",
    );
  }
  const photos = await draftPhotos(userId, draftId);
  const { data, error } = await supabase.storage
    .from(DRAFT_BUCKET)
    .createSignedUrls(
      photos.map((p) => p.object_key),
      600,
    );
  if (
    error ||
    !data ||
    data.length !== photos.length ||
    data.some((p) => !p.signedUrl)
  ) {
    await mutateDraft(userId, "fail", { draftId, operationId });
    throw new DraftError(
      503,
      "photo_signing_unavailable",
      "Your photos could not be loaded. Try again.",
    );
  }
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        draftId,
        inputVersion: row.input_version,
        settings: row.settings,
        photos: photos.map((p) => [p.id, p.digest]),
      }),
    )
    .digest("hex");
  await mutateDraft(userId, "fingerprint", { draftId, operationId, hash });
  return {
    context: { userId, draftId, operationId, hash },
    body: {
      ...row.settings,
      imageUrls: data.map((p) => p.signedUrl),
      useEmojis: false,
      useHashtags: false,
      generationMode: input.generationMode === "batch" ? "batch" : "manual",
    },
  };
}
export async function bindDraftGeneration(
  context: DraftGenerationContext,
  reservationId: string,
) {
  return mutateDraft(context.userId, "bind", {
    draftId: context.draftId,
    operationId: context.operationId,
    reservationId,
  });
}
export async function storeDraftGeneration(
  context: DraftGenerationContext,
  reservationId: string,
  result: MobileGenerationResponse,
) {
  return mutateDraft(context.userId, "pending", {
    draftId: context.draftId,
    operationId: context.operationId,
    reservationId,
    result,
  });
}
export async function completeDraftGeneration(context: DraftGenerationContext) {
  await mutateDraft(context.userId, "complete", {
    draftId: context.draftId,
    operationId: context.operationId,
  });
  return { ok: true };
}
