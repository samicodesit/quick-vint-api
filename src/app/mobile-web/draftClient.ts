import { fetchMobileJson } from "./api";
import { getBrowserSession } from "./auth";
import {
  permittedDraftSettings,
  type Draft,
  type DraftSettingsAccess,
} from "./draftContracts";
import {
  generateListing,
  type MobileGenerationResult,
} from "./generationClient";
import {
  LocalDraftStore,
  localDraftError,
  type LocalDraftAttempt,
} from "./localDraftStore";
import {
  cleanupUploadSession,
  createMobileUploadSession,
  uploadPreparedPhotos,
  type MobileUploadSession,
} from "./uploadClient";

export interface DraftAttempt {
  operationId: string;
  inputVersion: number;
}
type Recovery = {
  state:
    | "succeeded"
    | "pending"
    | "failed"
    | "missing"
    | "expired"
    | "unavailable";
  result?: MobileGenerationResult;
};

/** One account and lifetime per workspace, never a global mutable account binding. */
export function createDraftClient(userId: string) {
  const store = new LocalDraftStore(userId);
  const controller = new AbortController();
  const active = new Map<string, Promise<unknown>>();
  const results = new Map<string, MobileGenerationResult>();
  let disposed = false;
  async function cleanup(attempt: LocalDraftAttempt) {
    if (!attempt.upload) return;
    const session = await getBrowserSession().catch(() => null);
    if (session?.user.id !== userId) return;
    await cleanupUploadSession(
      { ...attempt.upload, accessToken: session.access_token, userId },
      "post-generation",
    ).catch(() => undefined);
  }
  async function recover(draftId: string, ownAttempt = false): Promise<Draft> {
    let draft = await store.action("detail", { draftId });
    if (
      !draft.operation_id ||
      !["running", "pending"].includes(draft.operation_state) ||
      (!ownAttempt && active.has(draftId))
    )
      return draft;
    const attempt = await store.attempt(draftId);
    const result = results.get(draftId);
    if (result) {
      await store.finishAttempt(
        draftId,
        draft.operation_id,
        "succeeded",
        result,
      );
      results.delete(draftId);
      if (attempt) void cleanup(attempt);
    } else if (
      !attempt?.sentAt &&
      (!attempt || Date.now() - attempt.createdAt > 3 * 60 * 1000)
    ) {
      await store.finishAttempt(draftId, draft.operation_id, "failed");
      if (attempt) void cleanup(attempt);
    } else if (attempt?.sentAt) {
      const recovered = await fetchMobileJson<Recovery>(
        `/api/generation-result?requestId=${encodeURIComponent(draft.operation_id)}`,
        { method: "GET", signal: controller.signal },
        { expectedUserId: userId },
      );
      if (recovered.state === "succeeded" && recovered.result) {
        results.set(draftId, recovered.result);
        await store.finishAttempt(
          draftId,
          draft.operation_id,
          "succeeded",
          recovered.result,
        );
        results.delete(draftId);
        void cleanup(attempt);
      } else if (
        ["failed", "expired", "unavailable"].includes(recovered.state) ||
        (recovered.state === "missing" &&
          Date.now() - attempt.sentAt > 3 * 60 * 1000)
      ) {
        await store.finishAttempt(draftId, draft.operation_id, "failed");
        void cleanup(attempt);
      }
    }
    draft = await store.action("detail", { draftId });
    return draft;
  }
  async function run(
    draft: Draft,
    attempt: DraftAttempt,
    batch: boolean,
    access: DraftSettingsAccess,
  ) {
    const current = await store.action("detail", { draftId: draft.id });
    if (
      current.operation_id === attempt.operationId ||
      ["running", "pending"].includes(current.operation_state)
    ) {
      if (current.operation_id !== attempt.operationId)
        throw localDraftError(
          "draft_conflict",
          "This item is generating in another tab. Check its result before generating again.",
        );
      const recovered = await recover(current.id, true);
      if (recovered.operation_state === "succeeded") return recovered;
      throw localDraftError(
        recovered.operation_state === "failed"
          ? "generation_retry"
          : "generation_commit_pending",
        recovered.operation_state === "failed"
          ? "This attempt did not finish. Review the item and generate again."
          : "This item's result is still being checked. Check its saved result shortly.",
      );
    }
    const saved = await store.beginAttempt(current.id, attempt, batch);
    let upload: MobileUploadSession | undefined;
    try {
      const session = await getBrowserSession();
      if (session?.user.id !== userId || disposed)
        throw localDraftError(
          "account_changed",
          "Sign in to the same account to continue this item.",
          401,
        );
      upload = { ...createMobileUploadSession(session.access_token), userId };
      saved.upload = {
        sessionId: upload.sessionId,
        uploaderId: upload.uploaderId,
      };
      await store.updateAttempt(saved);
      const blobs = await store.photoFiles(
        current.photos.map((photo) => photo.id),
      );
      const files = blobs.map(
        (blob, index) =>
          new File([blob], `photo-${index}.jpg`, { type: "image/jpeg" }),
      );
      const imageUrls = await uploadPreparedPhotos(
        upload,
        files,
        controller.signal,
      );
      const settings = permittedDraftSettings(current.settings, access);
      saved.input = {
        imageUrls,
        titleLanguageCode: settings.titleLanguageCode,
        descriptionLanguageCode: settings.descriptionLanguageCode,
        descriptionLength: settings.descriptionLength,
        useBulletPoints: settings.useBulletPoints,
        tone: settings.tone,
        useEmojis: settings.useEmojis,
        useHashtags: settings.useHashtags,
        descriptionFooterText: settings.includeSellerNote
          ? settings.descriptionFooterText
          : "",
        generationMode: batch ? "batch" : "manual",
      };
      saved.sentAt = Date.now();
      await store.updateAttempt(saved);
      const result = await generateListing({
        ...saved.input,
        requestId: attempt.operationId,
        expectedUserId: userId,
        signal: controller.signal,
      });
      results.set(current.id, result);
      await store.finishAttempt(
        current.id,
        attempt.operationId,
        "succeeded",
        result,
      );
      results.delete(current.id);
      void cleanup(saved);
      return result;
    } catch (error) {
      const status = (error as { status?: number }).status || 0;
      const code = (error as { code?: string }).code;
      const knownFailure =
        !saved.sentAt ||
        ([400, 401, 403, 413, 415, 422, 429].includes(status) &&
          code !== "generation_commit_pending");
      await store
        .finishAttempt(
          current.id,
          attempt.operationId,
          knownFailure ? "failed" : "pending",
        )
        .catch(() => undefined);
      if (knownFailure && upload) void cleanup(saved);
      throw error;
    }
  }
  return {
    draftAction: <T = Draft>(
      action: string,
      input: Record<string, unknown> = {},
    ): Promise<T> =>
      (action === "recover"
        ? recover(String(input.draftId))
        : store.action(action, input)) as Promise<T>,
    listDrafts: (state: "draft" | "done" = "draft", cursor?: string) =>
      store.list(state, cursor),
    uploadDraftPhoto: (
      file: File,
      input: { photoId: string; importId: string; draftId?: string },
    ) => store.upload(file, input),
    editDraftPhoto: (
      input: { draftId: string; photoId: string; revision: number },
      replacement: Blob | null,
    ) => store.editPhoto(input, replacement),
    readDraftPhoto: async (photoId: string) =>
      (await store.photoFiles([photoId]))[0],
    executeDraftAttempt: (
      draft: Draft,
      attempt: DraftAttempt,
      batch: boolean,
      access: DraftSettingsAccess = { tone: true, extras: true },
    ) => {
      const existing = active.get(draft.id);
      if (existing) return existing;
      const operation = run(draft, attempt, batch, access).finally(() =>
        active.delete(draft.id),
      );
      active.set(draft.id, operation);
      return operation;
    },
    dispose: () => {
      disposed = true;
      controller.abort();
      store.dispose();
      results.clear();
    },
  };
}
