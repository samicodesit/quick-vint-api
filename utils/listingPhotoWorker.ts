import {
  photoPrompt,
  photoReferenceIndices,
  rearPosePrompt,
  photoCost,
  LISTING_PHOTO_CHECK_MODEL,
  REAR_PHOTO_CHECK_MODEL,
  type PhotoPlan,
  type PhotoSlot,
} from "./listingPhotoGeneration";
import { IMAGE_MODEL, CHECK_MODEL } from "./userModelGeneration";
const retryableCheckFailure = (code: string) =>
  /^(?:photo_provider_timeout|photo_provider_429|photo_provider_5\d{2})$/.test(
    code,
  );
export function photoFailureCode(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError")
    return "photo_provider_timeout";
  const message = error instanceof Error ? error.message : "";
  return /^(?:photo_provider_[45]\d{2}|photo_(?:quality_failed|cancelled|source_unavailable|source_too_large|source_snapshot_failed)|invalid_photo_(?:source|image|plan|check)|incomplete_photo_check|photo_provider_unavailable)$/.test(
    message,
  )
    ? message
    : "photo_operation_failed";
}
export interface PhotoJob {
  id: string;
  user_id: string;
  model_id: string;
  kind: "listing" | "rear";
  state: string;
  lease_token: string;
  retry_count: number;
  payload: any;
  source_expires_at: string;
  expires_at: string;
  error_code?: string;
}
export interface PhotoWorkerDependencies {
  mutate(user: string, action: string, input: any): Promise<any>;
  sources(job: PhotoJob): Promise<string[]>;
  front(job: PhotoJob): Promise<string>;
  rear(user: string): Promise<string | null>;
  classify(images: string[]): Promise<any>;
  edit(
    user: string,
    images: string[],
    prompt: string,
    rear?: boolean,
  ): Promise<any>;
  check(
    pose: string,
    bytes: Buffer,
    plan: PhotoPlan,
    slot: PhotoSlot,
    rear?: boolean,
    originals?: string[],
  ): Promise<any>;
  upload(key: string, bytes: Buffer): Promise<void>;
  download(key: string): Promise<Buffer>;
}
export async function runPhotoJob(
  user: string,
  id: string,
  deps: PhotoWorkerDependencies,
) {
  const job: PhotoJob | null = await deps.mutate(user, "claim", { id });
  if (!job) return;
  const jobKind = job.kind;
  const input = { id, lease: job.lease_token };
  const save = (payload: any, state?: string, errorCode?: string) =>
    deps.mutate(user, "save", {
      ...input,
      payload,
      ...(state ? { state } : {}),
      ...(errorCode ? { errorCode } : {}),
    });
  async function stage(
    name: string,
    kind: "image" | "check",
    work: () => Promise<any>,
    objectKey?: string,
  ) {
    // The durable intent is written BEFORE the provider call. An unknown result is not replayed.
    const attempt = await deps.mutate(user, "stage", {
      ...input,
      stage: name,
      objectKey,
    });
    if (!attempt) throw new Error("photo_cancelled");
    let result;
    try {
      result = await work();
    } catch (error) {
      await deps.mutate(user, "metrics", {
        ...input,
        attemptId: attempt.id,
        // Keep cost unknown. The provider may have completed a timed-out call.
        cost: null,
        status: "failed",
        metrics: { errorCode: photoFailureCode(error) },
      });
      throw error;
    }
    const model =
      kind === "image"
        ? IMAGE_MODEL
        : name === "classify"
          ? CHECK_MODEL
          : jobKind === "rear"
            ? REAR_PHOTO_CHECK_MODEL
            : LISTING_PHOTO_CHECK_MODEL;
    await deps.mutate(user, "metrics", {
      ...input,
      attemptId: attempt.id,
      cost: photoCost(kind, result.usage, model, result.serviceTier),
      metrics: {
        model,
        usage: result.usage,
        serviceTier: result.serviceTier || null,
        durationMs: result.durationMs,
        quality: result.quality,
      },
      status: "complete",
    });
    return result;
  }
  try {
    if (job.kind === "rear") {
      const front = await deps.front(job);
      const key = `${user}/${id}/${job.retry_count}/rear.jpg`;
      const generated = await stage(
        "rear",
        "image",
        () => deps.edit(user, [front], rearPosePrompt, true),
        key,
      );
      const [checked, uploaded] = await Promise.allSettled([
        stage("rear_check", "check", () =>
          deps.check(
            front,
            generated.bytes,
            {
              eligible: true,
              category: "full_body",
              frontIndex: 0,
              backIndex: -1,
              detailIndex: -1,
            },
            "secondary",
            true,
          ),
        ),
        deps.upload(key, generated.bytes),
      ]);
      if (uploaded.status === "rejected") throw uploaded.reason;
      if (checked.status === "rejected") throw checked.reason;
      if (!checked.value.accepted) throw new Error("photo_quality_failed");
      await save({ primary: { state: "ready", key } }, "ready");
      return;
    }
    let sources: string[] | undefined;
    let plan: PhotoPlan = job.payload.plan;
    if (!plan) {
      sources = await deps.sources(job);
      const result = await stage("classify", "check", () =>
        deps.classify(sources!),
      );
      plan = result.plan;
      await save({ plan });
    }
    if (!plan.eligible) {
      await save({ plan }, "skipped");
      return;
    }
    await save({ phase: "preparing" });
    const rear = await deps.rear(user);
    if (!rear) {
      await save({ phase: "preparing" }, "queued");
      return;
    }
    const front = await deps.front(job);
    sources ||= await deps.sources(job);
    await save({ phase: "generating" });
    await Promise.all(
      (["primary", "secondary"] as PhotoSlot[]).map(async (slot) => {
        if (job.payload[slot]?.state === "ready") return;
        const pose =
          slot === "secondary" || plan.category === "backpack" ? rear : front;
        const indices = photoReferenceIndices(plan, slot);
        const previous = job.payload[slot];
        const reuse =
          job.retry_count === 1 &&
          previous?.state === "failed" &&
          retryableCheckFailure(previous.errorCode) &&
          previous.candidateKey === `${user}/${id}/0/${slot}.jpg`;
        const key = reuse
          ? previous.candidateKey
          : `${user}/${id}/${job.retry_count}/${slot}.jpg`;
        let candidateKey: string | undefined;
        try {
          const generated = reuse
            ? { bytes: await deps.download(key) }
            : await stage(
                slot,
                "image",
                () =>
                  deps.edit(
                    user,
                    [pose, ...indices.map((i) => sources![i])],
                    photoPrompt(plan, slot),
                  ),
                key,
              );
          const [checked, uploaded] = await Promise.allSettled([
            stage(slot + "_check", "check", () =>
              deps.check(
                pose,
                generated.bytes,
                plan,
                slot,
                false,
                indices.map((i) => sources![i]),
              ),
            ),
            reuse ? Promise.resolve() : deps.upload(key, generated.bytes),
          ]);
          if (uploaded.status === "rejected") throw uploaded.reason;
          if (checked.status === "rejected") {
            if (retryableCheckFailure(photoFailureCode(checked.reason)))
              candidateKey = key;
            throw checked.reason;
          }
          if (!checked.value.accepted) throw new Error("photo_quality_failed");
          await save({ [slot]: { state: "ready", key } });
        } catch (error) {
          await save({
            [slot]: {
              state: "failed",
              errorCode: photoFailureCode(error),
              ...(candidateKey ? { candidateKey } : {}),
            },
          });
        }
      }),
    );
    const latest = await deps.mutate(user, "get", { id });
    if (!latest) return;
    const ready = ["primary", "secondary"].every(
      (slot) => latest.payload[slot]?.state === "ready",
    );
    await save(
      {},
      ready ? "ready" : "failed",
      ready ? undefined : "photo_generation_failed",
    );
  } catch (error) {
    await save({}, "failed", photoFailureCode(error));
  }
}
