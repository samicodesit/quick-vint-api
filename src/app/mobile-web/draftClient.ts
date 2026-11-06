import { uiText } from "./ui";
import { fetchMobileJson } from "./api";
import { trackSavedDrafts } from "./savedDraftTracking";
import { getBrowserSession } from "./auth";
import { trackMobileEvent } from "./analytics";
import {
  permittedDraftSettings,
  sourcePhotos,
  sourcePhotoSignature,
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

type ModelPhotoSlot = "primary" | "secondary";
function availablePhotos(state: any): { slot: ModelPhotoSlot; url: string }[] {
  if (
    !["generating", "preparing", "queued", "ready", "failed"].includes(
      state.status,
    )
  )
    return [];
  if (!Array.isArray(state.photos)) {
    if (state.status === "ready") throw new Error("invalid_photo_pair");
    return [];
  }
  const legacy =
    state.status === "ready" &&
    state.photos.length === 2 &&
    state.photos.every((p: any) => !p.slot);
  const photos = state.photos.map((photo: any, index: number) => ({
    slot: legacy ? (index === 0 ? "primary" : "secondary") : photo.slot,
    url: photo.url,
  }));
  if (
    photos.length > 2 ||
    (state.status === "ready" && photos.length !== 2) ||
    new Set(photos.map((p: any) => p.slot)).size !== photos.length ||
    photos.some(
      (p: any) =>
        !["primary", "secondary"].includes(p.slot) || typeof p.url !== "string",
    )
  )
    throw new Error("invalid_photo_pair");
  return photos;
}

/** One account and lifetime per workspace, never a global mutable account binding. */
export function createDraftClient(userId: string) {
  const store = new LocalDraftStore(userId);
  const edits = trackSavedDrafts(store);
  const controller = new AbortController();
  const active = new Map<string, Promise<unknown>>();
  const results = new Map<string, MobileGenerationResult>();
  let disposed = false;
  const photoTasks = new Map<string, Promise<void>>();
  const photoListeners = new Set<() => void>();
  const notifyPhotos = () => photoListeners.forEach((listener) => listener());
  const photoRequest = (id: string, action?: string) =>
    fetchMobileJson<any>(
      action
        ? "/api/listing-model-photos"
        : `/api/listing-model-photos?id=${encodeURIComponent(id)}`,
      {
        method: action ? "POST" : "GET",
        signal: controller.signal,
        ...(action
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, action }),
            }
          : {}),
      },
      { expectedUserId: userId },
    );
  async function pollPhotos(draftId: string) {
    let failures = 0;
    const started = Date.now();
    while (!disposed && Date.now() - started < 15 * 60 * 1000) {
      const draft: Draft = await store.action("detail", { draftId });
      const job = draft.modelPhotos;
      if (
        !job ||
        job.attached ||
        [
          "attached",
          "skipped",
          "cancelled",
          "failed",
          "attachment_failed",
          "connection_failed",
        ].includes(job.status) ||
        draft.state !== "draft"
      )
        return;
      if (sourcePhotoSignature(draft.photos) !== job.sourceSignature) {
        await store.updateModelPhotos(draftId, job.jobId, {
          status: "cancelled",
        });
        notifyPhotos();
        return;
      }
      try {
        const state = await photoRequest(job.jobId);
        failures = 0;
        if (disposed) return;
        if (state.status === "ready" || state.photos?.length) {
          await store.updateModelPhotos(draftId, job.jobId, {
            status: state.status === "ready" ? "adding" : state.status,
            eligible: state.eligible ?? true,
            canRetry: state.canRetry,
          });
          notifyPhotos();
          try {
            const photos = availablePhotos(state).filter(
              (photo) => !job.receivedSlots?.includes(photo.slot),
            );
            for (const photo of photos) {
              const url = new URL(photo.url);
              if (url.protocol !== "https:")
                throw new Error("invalid_photo_url");
              const response = await fetch(url, {
                signal: controller.signal,
              });
              if (!response.ok) throw new Error("photo_download_failed");
              const blob = await response.blob();
              if (blob.size > 4 * 1024 * 1024)
                throw new Error("photo_too_large");
              if ((await getBrowserSession())?.user.id !== userId || disposed)
                return;
              // Recheck the server-side enable/ownership fence after downloading.
              const fresh = await photoRequest(job.jobId);
              if (disposed) return;
              if (!availablePhotos(fresh).some((p) => p.slot === photo.slot)) {
                await store.updateModelPhotos(draftId, job.jobId, {
                  status: "cancelled",
                });
                notifyPhotos();
                return;
              }
              await store.attachModelPhotos(draftId, job.jobId, [
                { slot: photo.slot, blob },
              ]);
              notifyPhotos();
            }
            const current = await store.action("detail", { draftId });
            if (current.modelPhotos?.attached) {
              void trackMobileEvent(
                "model_photos_attached",
                { operationId: job.jobId, imageCount: 2 },
                userId,
              );
              void photoRequest(job.jobId, "attached").catch(() => {});
              return;
            }
          } catch (error: any) {
            if (disposed) return;
            if (
              ![401, 403, 404].includes(error?.status) &&
              error?.code !== "photo_source_changed"
            )
              void photoRequest(job.jobId, "attachment_failed").catch(() => {});
            await store.updateModelPhotos(draftId, job.jobId, {
              status:
                error?.code === "photo_source_changed" ||
                [401, 403, 404].includes(error?.status)
                  ? "cancelled"
                  : "attachment_failed",
              canRetry: true,
            });
          }
          notifyPhotos();
          const current = await store.action("detail", { draftId });
          if (
            ["cancelled", "attachment_failed"].includes(
              current.modelPhotos?.status || "",
            )
          )
            return;
        }
        if (
          job.status !== state.status ||
          job.eligible !== state.eligible ||
          job.canRetry !== state.canRetry
        ) {
          await store.updateModelPhotos(draftId, job.jobId, {
            status: state.status,
            eligible: state.eligible,
            canRetry: state.canRetry,
          });
          notifyPhotos();
        }
        if (["skipped", "failed", "cancelled"].includes(state.status)) return;
        // A durable queued job may need resuming after a server interruption.
        await photoRequest(job.jobId, "resume");
      } catch (error: any) {
        if (disposed) return;
        if ([401, 403, 404].includes(error?.status)) {
          await store.updateModelPhotos(draftId, job.jobId, {
            status: "cancelled",
          });
          notifyPhotos();
          return;
        }
        if (++failures >= 3) {
          await store.updateModelPhotos(draftId, job.jobId, {
            status: "connection_failed",
            canRetry: true,
          });
          notifyPhotos();
          return;
        }
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 2000);
        controller.signal.addEventListener("abort", done, { once: true });
        if (controller.signal.aborted) done();
      });
    }
    if (!disposed) {
      const draft = await store.action("detail", { draftId });
      if (draft.modelPhotos)
        await store.updateModelPhotos(draftId, draft.modelPhotos.jobId, {
          status: "connection_failed",
          canRetry: true,
        });
      notifyPhotos();
    }
  }
  function watchPhotos(draft: Draft) {
    if (
      disposed ||
      !draft.modelPhotos ||
      draft.modelPhotos.attached ||
      photoTasks.has(draft.id) ||
      [
        "skipped",
        "cancelled",
        "failed",
        "attachment_failed",
        "connection_failed",
      ].includes(draft.modelPhotos.status)
    )
      return;
    const work = pollPhotos(draft.id)
      .catch(() => {})
      .finally(() => photoTasks.delete(draft.id));
    photoTasks.set(draft.id, work);
  }
  async function cleanup(attempt: LocalDraftAttempt) {
    if (!attempt.upload) return;
    // Source snapshots may still be copying while text finishes. The existing
    // upload-session TTL cleans these sources safely after the photo worker.
    const draft = await store
      .action("detail", { draftId: attempt.draftId })
      .catch(() => null);
    if (draft?.modelPhotos) return;
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
          uiText(
            "This item is generating in another tab. Check its result before generating again.",
          ),
        );
      const recovered = await recover(current.id, true);
      if (recovered.operation_state === "succeeded") return recovered;
      throw localDraftError(
        recovered.operation_state === "failed"
          ? "generation_retry"
          : "generation_commit_pending",
        recovered.operation_state === "failed"
          ? uiText(
              "This attempt did not finish. Review the item and generate again.",
            )
          : uiText(
              "This item's result is still being checked. Check its saved result shortly.",
            ),
      );
    }
    const saved = await store.beginAttempt(current.id, attempt, batch);
    let upload: MobileUploadSession | undefined;
    try {
      const session = await getBrowserSession();
      if (session?.user.id !== userId || disposed)
        throw localDraftError(
          "account_changed",
          uiText("Sign in to the same account to continue this item."),
          401,
        );
      upload = { ...createMobileUploadSession(session.access_token), userId };
      saved.upload = {
        sessionId: upload.sessionId,
        uploaderId: upload.uploaderId,
      };
      await store.updateAttempt(saved);
      const blobs = await store.photoFiles(
        sourcePhotos(current.photos).map((photo) => photo.id),
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
        modelPhotoSourceKey: sourcePhotoSignature(current.photos),
        modelPhotosEligible: !(
          current.modelPhotos?.attached &&
          current.modelPhotos.sourceSignature ===
            sourcePhotoSignature(current.photos)
        ),
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
      if (!disposed && result.modelPhotos?.jobId)
        void trackMobileEvent(
          "model_photos_requested",
          {
            operationId: result.modelPhotos.jobId,
            mode: batch ? "batch" : "single",
          },
          userId,
        );
      results.set(current.id, result);
      await store.finishAttempt(
        current.id,
        attempt.operationId,
        "succeeded",
        result,
      );
      results.delete(current.id);
      watchPhotos(await store.action("detail", { draftId: current.id }));
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
    observeDraft: edits.observe,
    flushDraftEdits: edits.leave,
    draftAction: async <T = Draft>(
      action: string,
      input: Record<string, unknown> = {},
    ): Promise<T> => {
      const result = await (action === "recover"
        ? recover(String(input.draftId))
        : store.action(action, input));
      if (action === "save") edits.saved(result);
      return result as T;
    },
    listDrafts: async (state: "draft" | "done" = "draft", cursor?: string) => {
      const library = await store.list(state, cursor);
      if (state === "draft") library.drafts.forEach(watchPhotos);
      return library;
    },
    onModelPhotosChange: (callback: () => void) => {
      photoListeners.add(callback);
      return () => photoListeners.delete(callback);
    },
    retryModelPhotos: async (draftId: string) => {
      await photoTasks.get(draftId);
      const draft = await store.action("detail", { draftId });
      const job = draft.modelPhotos;
      if (!job) return;
      if (job.status === "failed") await photoRequest(job.jobId, "retry");
      await store.updateModelPhotos(draftId, job.jobId, {
        status: "queued",
        canRetry: false,
      });
      watchPhotos(await store.action("detail", { draftId }));
      notifyPhotos();
    },
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
      edits.dispose();
      controller.abort();
      photoListeners.clear();
      store.dispose();
      results.clear();
    },
  };
}
