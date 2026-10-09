import { fetchMobileJson } from "./api";
import type { Draft, DraftLibrary, DraftPhoto } from "./draftContracts";
export function draftAction<T = Draft>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  return fetchMobileJson<T>("/api/drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autolister-Client": "mobile_web",
    },
    body: JSON.stringify({ action, input }),
  });
}
export function listDrafts(state: "draft" | "done" = "draft", cursor?: string) {
  return draftAction<DraftLibrary>("list", {
    state,
    ...(cursor ? { cursor } : {}),
  });
}
export async function uploadDraftPhoto(
  file: File,
  input: { photoId: string; importId: string; draftId?: string },
): Promise<DraftPhoto> {
  const grant = await draftAction<{
    photo: DraftPhoto;
    uploadUrl?: string;
    complete?: boolean;
  }>("grant", { ...input, bytes: file.size });
  if (grant.complete) return grant.photo;
  if (!grant.uploadUrl)
    throw new Error("This photo could not be uploaded. Try again.");
  return fetchMobileJson<DraftPhoto>(grant.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: file,
  });
}
export async function generateDraft(
  draft: Draft,
  operationId: string,
  batch: boolean,
) {
  return fetchMobileJson("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autolister-Client": "mobile_web",
      "X-Autolister-Request-Id": operationId,
    },
    body: JSON.stringify({
      draftId: draft.id,
      inputVersion: draft.input_version,
      generationMode: batch ? "batch" : "manual",
    }),
  });
}
export interface DraftAttempt {
  operationId: string;
  inputVersion: number;
}
export async function executeDraftAttempt(
  draft: Draft,
  attempt: DraftAttempt,
  batch: boolean,
) {
  if (
    draft.operation_id === attempt.operationId ||
    draft.operation_state === "running" ||
    draft.operation_state === "pending"
  ) {
    const recovered = await draftAction("recover", { draftId: draft.id });
    if (recovered.operation_id !== attempt.operationId)
      throw Object.assign(
        new Error(
          "This item was generated in another session. Review its saved result before generating again.",
        ),
        { code: "draft_conflict" },
      );
    if (recovered.operation_state === "succeeded") return recovered;
    throw Object.assign(
      new Error(
        recovered.operation_state === "failed"
          ? "This attempt did not finish. Review the item and try generating again."
          : "This item's result is still being saved. Check it before retrying.",
      ),
      {
        code:
          recovered.operation_state === "failed"
            ? "generation_retry"
            : "generation_commit_pending",
      },
    );
  }
  if (draft.input_version !== attempt.inputVersion)
    throw Object.assign(
      new Error(
        "This item changed while the batch was paused. Review it before generating again.",
      ),
      { code: "draft_conflict" },
    );
  return generateDraft(draft, attempt.operationId, batch);
}
