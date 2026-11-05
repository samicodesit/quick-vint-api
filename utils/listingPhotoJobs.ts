import { waitUntil } from "@vercel/functions";
import { supabase } from "./supabaseClient";
import { isAccountPaused } from "../src/utils/accountPause";
import { isGenerationSuspendedForPayment } from "../src/utils/subscriptionStatus";
import {
  PHOTO_BUCKET,
  sourceFingerprint,
  classifyListingPhotos,
  editListingPhoto,
  checkListingPhoto,
} from "./listingPhotoGeneration";
import { runPhotoJob, type PhotoJob } from "./listingPhotoWorker";
import { getGenerationReservationParams } from "./rateLimiter";
export const listingPhotosEnabled = () =>
  process.env.LISTING_MODEL_PHOTOS_ENABLED === "true" &&
  process.env.USER_MODELS_ENABLED === "true";
export async function photoAccess(user: string) {
  const [brake, profile] = await Promise.all([
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "emergency_brake")
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id,account_status,subscription_status,paid_access_expires_at")
      .eq("id", user)
      .maybeSingle(),
  ]);
  if (brake.error || brake.data?.value === "true") return false;
  const { data, error } = profile;
  return (
    !error &&
    !!data &&
    !isAccountPaused(data) &&
    !isGenerationSuspendedForPayment(
      data.subscription_status,
      data.paid_access_expires_at,
    )
  );
}
export async function photoMutate(
  user: string,
  action: string,
  input: Record<string, unknown> = {},
) {
  if (
    action === "stage" &&
    input.stage !== "source" &&
    !(await photoAccess(user))
  )
    return null;
  const { data, error } = await supabase.rpc("listing_photo_mutate", {
    p_user_id: user,
    p_action: action,
    p_input: input,
  });
  if (error) throw error;
  return data;
}
function background(promise: Promise<unknown>) {
  const safe = promise.catch(() =>
    console.warn("Listing photo background task failed"),
  );
  try {
    waitUntil(safe);
  } catch {
    /* Local runner owns the promise. */
  }
}
export function validPhotoSource(value: string) {
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))
    return value.length <= 14000000;
  try {
    const url = new URL(value);
    const storage = new URL(
      process.env.VERCEL_APP_SUPABASE_URL || "https://invalid.invalid",
    );
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === storage.hostname ||
        url.hostname.endsWith(".vinted.net"))
    );
  } catch {
    return false;
  }
}
async function imageData(value: string) {
  if (!validPhotoSource(value)) throw new Error("invalid_photo_source");
  if (value.startsWith("data:")) return value;
  const response = await fetch(value, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("photo_source_unavailable");
  const mime = (response.headers.get("content-type") || "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("invalid_photo_source");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid_photo_source");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    length += chunk.length;
    if (length > 10485760) {
      await reader.cancel();
      throw new Error("photo_source_too_large");
    }
    chunks.push(chunk);
  }
  return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
}
async function signed(bucket: string, key: string) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, 600);
  if (error) throw error;
  return data.signedUrl;
}
async function sources(job: PhotoJob) {
  if (job.payload.sourceKeys)
    return Promise.all(
      job.payload.sourceKeys.map(async (key: string) =>
        imageData(await signed(PHOTO_BUCKET, key)),
      ),
    );
  const urls: string[] = job.payload.sources || [];
  if (!urls.length || urls.length > 20)
    throw new Error("invalid_photo_sources");
  const images: string[] = [];
  const keys: string[] = [];
  for (let offset = 0; offset < urls.length; offset += 4) {
    const batch = await Promise.all(
      urls.slice(offset, offset + 4).map(imageData),
    );
    images.push(...batch);
  }
  const snapshots = await Promise.allSettled(
    images.map(async (image, i) => {
      const match = images[i].match(
        /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/,
      )!;
      const key = `${job.user_id}/${job.id}/source-${i}.${match[1].split("/")[1]}`;
      const attempt = await photoMutate(job.user_id, "stage", {
        id: job.id,
        lease: job.lease_token,
        stage: "source",
        objectKey: key,
      });
      if (!attempt) throw new Error("photo_cancelled");
      try {
        const upload = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(key, Buffer.from(match[2], "base64"), {
            contentType: match[1],
            upsert: true,
          });
        if (upload.error) throw upload.error;
        await photoMutate(job.user_id, "metrics", {
          id: job.id,
          lease: job.lease_token,
          attemptId: attempt.id,
          cost: 0,
          metrics: {},
        });
        keys[i] = key;
      } catch {
        await photoMutate(job.user_id, "metrics", {
          id: job.id,
          lease: job.lease_token,
          attemptId: attempt.id,
          cost: 0,
          status: "failed",
          metrics: { errorCode: "photo_source_snapshot_failed" },
        });
        throw new Error("photo_source_snapshot_failed");
      }
    }),
  );
  for (const snapshot of snapshots) {
    if (snapshot.status === "rejected") throw snapshot.reason;
  }
  await photoMutate(job.user_id, "save", {
    id: job.id,
    lease: job.lease_token,
    payload: { sourceKeys: keys, sources: [] },
  });
  return images;
}
export async function prepareRearModel(
  user: string,
  allowRetry = false,
): Promise<string | null> {
  if (!listingPhotosEnabled() || !(await photoAccess(user))) return null;
  let job = await photoMutate(user, "create", {
    kind: "rear",
    fingerprint: "rear-v1",
  });
  if (!job) return null;
  if (
    ["failed", "cancelled"].includes(job.state) &&
    allowRetry &&
    job.retry_count < 1
  )
    job = await photoMutate(user, "retry", { id: job.id });
  if (job.state === "failed" || job.state === "cancelled")
    throw new Error("rear_model_failed");
  if (job.state !== "ready") {
    await processListingPhotoJob(user, job.id);
    job = await photoMutate(user, "get", { id: job.id });
  }
  if (job?.state === "failed") throw new Error("rear_model_failed");
  return job?.state === "ready"
    ? signed(PHOTO_BUCKET, job.payload.primary.key)
    : null;
}
export function warmRearModel(user: string) {
  if (listingPhotosEnabled()) background(prepareRearModel(user));
}
export async function processListingPhotoJob(user: string, id: string) {
  if (!listingPhotosEnabled() || !(await photoAccess(user))) return;
  await runPhotoJob(user, id, {
    mutate: photoMutate,
    sources,
    front: async (job) => {
      const { data, error } = await supabase
        .from("user_models")
        .select("object_key")
        .eq("id", job.model_id)
        .eq("user_id", user)
        .eq("state", "ready")
        .single();
      if (error || !data?.object_key) throw new Error("model_not_ready");
      return signed("user-models", data.object_key);
    },
    rear: async () => {
      const job = await photoMutate(user, "get", { id });
      return prepareRearModel(user, job?.retry_count === 1);
    },
    classify: classifyListingPhotos,
    edit: editListingPhoto,
    check: checkListingPhoto,
    download: async (key) => {
      const image = await imageData(await signed(PHOTO_BUCKET, key));
      const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
      if (bytes.length < 1000 || bytes[0] !== 255 || bytes[1] !== 216)
        throw new Error("invalid_photo_image");
      return bytes;
    },
    upload: async (key, bytes) => {
      const result = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(key, bytes, { contentType: "image/jpeg", upsert: false });
      if (result.error) throw result.error;
    },
  });
}
export async function startListingPhotos(
  user: string,
  generationId: string,
  sources: string[],
  sourceKey?: string,
) {
  if (!listingPhotosEnabled() || !generationId) return undefined;
  try {
    if (
      !sources.length ||
      sources.length > 20 ||
      !sources.every(validPhotoSource)
    )
      return undefined;
    if (!(await photoAccess(user))) return undefined;
    const fingerprint = sourceFingerprint(
      typeof sourceKey === "string" && sourceKey.length <= 8192
        ? ["client-revision:" + sourceKey]
        : sources,
    );
    const job = await photoMutate(user, "create", {
      generationId,
      fingerprint,
      sources,
    });
    if (!job) return undefined;
    if (job.state === "queued")
      background(processListingPhotoJob(user, job.id));
    return { jobId: job.id, status: job.state };
  } catch {
    console.warn("Could not admit listing model photos");
    return undefined;
  }
}
export async function admitPhotoOnly(
  user: string,
  sources: string[],
  sourceKey?: string,
) {
  if (
    !listingPhotosEnabled() ||
    !sources.length ||
    sources.length > 20 ||
    !sources.every(validPhotoSource)
  )
    throw new Error("invalid_photo_sources");
  if (!(await photoAccess(user))) throw new Error("account_unavailable");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user)
    .single();
  if (error || !profile) throw new Error("account_unavailable");
  const fingerprint = sourceFingerprint(
    typeof sourceKey === "string" && sourceKey.length <= 8192
      ? ["client-revision:" + sourceKey]
      : sources,
  );
  const job = await photoMutate(user, "admit", {
    fingerprint,
    sources,
    limits: getGenerationReservationParams(profile),
  });
  if (!job?.id) return { denied: true, code: job?.code || "model_not_ready" };
  if (job.state === "queued") background(processListingPhotoJob(user, job.id));
  return { jobId: job.id, status: job.state };
}
export async function getListingPhotoJob(user: string, id: string) {
  const job = await photoMutate(user, "get", { id });
  if (!job || job.kind !== "listing") return null;
  if (Date.parse(job.expires_at) < Date.now())
    return { jobId: id, status: "failed", canRetry: false };
  const payload = job.payload;
  return {
    jobId: id,
    status:
      job.state === "running" || job.state === "queued"
        ? payload.plan?.eligible
          ? payload.phase || "generating"
          : "analyzing"
        : job.state,
    eligible: payload.plan?.eligible === true,
    canRetry:
      job.state === "failed" &&
      job.retry_count < 1 &&
      Date.parse(job.source_expires_at) > Date.now(),
    ...(job.state === "ready"
      ? {
          photos: await Promise.all(
            ["primary", "secondary"].map(async (slot) => ({
              id: `${id}-${slot}`,
              slot,
              url: await signed(PHOTO_BUCKET, payload[slot].key),
            })),
          ),
        }
      : {}),
  };
}
export async function recoverListingPhotos() {
  if (!listingPhotosEnabled()) return;
  const { data, error } = await supabase
    .from("listing_photo_jobs")
    .select("id,user_id")
    .in("state", ["queued", "running"])
    .order("created_at")
    .limit(8);
  if (error) throw error;
  await Promise.allSettled(
    (data || [])
      .filter((j) => j.user_id)
      .map((j) => processListingPhotoJob(j.user_id!, j.id)),
  );
}
export async function cleanListingPhotos() {
  const cleanup = await supabase.rpc("listing_photo_cleanup");
  if (cleanup.error) {
    if (
      !listingPhotosEnabled() &&
      ["42883", "PGRST202"].includes(cleanup.error.code)
    )
      return;
    throw cleanup.error;
  }
  // Attempt keys survive account/job deletion so private objects never become permanent orphans.
  const { data, error } = await supabase
    .from("listing_photo_attempts")
    .select("id,job_id,user_id,stage,object_key,created_at")
    .not("object_key", "is", null)
    .not("object_key", "like", "removed/%")
    .or(
      `job_id.is.null,user_id.is.null,retain_until.lt.${new Date().toISOString()}`,
    )
    .order("created_at")
    .limit(500);
  if (error) throw error;
  for (const attempt of data || []) {
    let keep = false;
    if (attempt.job_id && attempt.user_id) {
      const { data: job, error: jobError } = await supabase
        .from("listing_photo_jobs")
        .select("kind,state,source_expires_at,expires_at,payload")
        .eq("id", attempt.job_id)
        .maybeSingle();
      if (jobError) throw jobError;
      if (job) {
        const deadline =
          attempt.stage === "source" ? job.source_expires_at : job.expires_at;
        keep =
          (job.kind === "rear" &&
            job.state === "ready" &&
            job.payload.primary?.key === attempt.object_key) ||
          (job.kind !== "rear" && Date.parse(deadline) > Date.now());
      }
    }
    if (keep) continue;
    const removed = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove([attempt.object_key]);
    if (removed.error) throw removed.error;
    const updated = await supabase
      .from("listing_photo_attempts")
      .update({ object_key: "removed/" + attempt.id })
      .eq("id", attempt.id);
    if (updated.error) throw updated.error;
  }
}
