import { createHash } from "node:crypto";
import { supabase } from "./supabaseClient";

export const INPUT_REVIEW_MS = 24 * 60 * 60 * 1000;
export const REVIEW_PREFIX = "_review-";
const BUCKET = "temp-uploads";
const SESSION =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PHOTO = /^\d{6}-upload\.(?:jpg|jpeg|png|webp|avif|heic|heif)$/i;
type File = { name: string; created_at?: string | null };
type ReviewImage = { index: number; path: string; sha256: string };

export function publicUploadSessionAllowed(value: unknown) {
  return (
    typeof value === "string" &&
    /^[a-z0-9_-]+$/i.test(value) &&
    !value.startsWith(REVIEW_PREFIX)
  );
}

function validPhotoPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const parts = path.split("/");
  return parts.length === 2 && SESSION.test(parts[0]) && PHOTO.test(parts[1]);
}

// Called after the response. Hash bytes already sent to the provider, never
// fetch images again or upload a second copy. External and inline inputs stay
// outside this retention policy.
export function buildInputPhotoReview(
  original: string[],
  prepared: string[],
  now = Date.now(),
) {
  const images: ReviewImage[] = [];
  for (let index = 0; index < Math.min(original.length, 100); index++) {
    try {
      const url = new URL(original[index]);
      if (
        url.origin !== new URL(process.env.VERCEL_APP_SUPABASE_URL || "").origin
      )
        continue;
      const match = url.pathname.match(
        /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/temp-uploads\/(.+)$/,
      );
      const path = match && decodeURIComponent(match[1]);
      const data = prepared[index]?.match(
        /^data:image\/[^;,]+;base64,([\s\S]+)$/,
      );
      if (!validPhotoPath(path) || !data) continue;
      images.push({
        index,
        path,
        sha256: createHash("sha256")
          .update(Buffer.from(data[1], "base64"))
          .digest("hex"),
      });
    } catch {
      /* Unsupported input sources are unobserved. */
    }
  }
  return images.length
    ? { v: 1, expiresAt: new Date(now + INPUT_REVIEW_MS).toISOString(), images }
    : undefined;
}

export async function listReviewFiles(prefix: string): Promise<File[]> {
  const result: File[] = [];
  const bucket = supabase.storage.from(BUCKET);
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("Photo review storage listing failed");
    result.push(...(data || []));
    if (!data || data.length < 100) return result;
  }
}

// The deadline is encoded in the destination before moving, so storage move
// timestamp behavior and cleanup retries cannot renew retention.
export async function retireUploadFiles(
  session: string,
  files: File[],
  now = Date.now(),
) {
  const remove: string[] = [];
  const moves: Array<[string, string]> = [];
  for (const file of files) {
    const path = `${session}/${file.name}`;
    const expires = Date.parse(file.created_at || "") + INPUT_REVIEW_MS;
    if (
      validPhotoPath(path) &&
      Number.isFinite(expires) &&
      expires > now &&
      expires <= now + INPUT_REVIEW_MS
    ) {
      moves.push([path, `${REVIEW_PREFIX}${session}/${expires}-${file.name}`]);
    } else {
      remove.push(path);
    }
  }
  for (let start = 0; start < moves.length; start += 8) {
    const results = await Promise.allSettled(
      moves.slice(start, start + 8).map(async ([from, to]) => {
        const { error } = await supabase.storage.from(BUCKET).move(from, to);
        if (error) throw new Error("Photo review storage move failed");
      }),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Photo review storage move failed");
  }
  if (remove.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(remove);
    if (error) throw new Error("Upload cleanup failed");
  }
}

export async function cleanupReviewFolder(folder: string, now = Date.now()) {
  const files = await listReviewFiles(folder);
  const expired = files
    .filter((file) => {
      const match = file.name.match(/^(\d{13})-/);
      return (
        !match ||
        Number(match[1]) <= now ||
        Number(match[1]) > now + INPUT_REVIEW_MS
      );
    })
    .map((file) => `${folder}/${file.name}`);
  if (expired.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(expired);
    if (error) throw new Error("Photo review expiry cleanup failed");
  }
  return expired.length;
}

// Admin-only caller. A readable photo is not proof until its bytes match the
// logged sha256. Short URLs expire no later than the original upload deadline.
export async function signInputPhotoReview(
  log: { created_at?: string; full_request_body?: any },
  now = Date.now(),
) {
  const review = log.full_request_body?.inputPhotoReview;
  const limit = Math.min(
    Date.parse(log.created_at || "") + INPUT_REVIEW_MS,
    Date.parse(review?.expiresAt || ""),
  );
  if (
    review?.v !== 1 ||
    !Array.isArray(review.images) ||
    !Number.isFinite(limit) ||
    limit <= now
  )
    return [];
  const result: Array<ReviewImage & { signedUrl: string; expiresAt: string }> =
    [];
  const cache = new Map<string, File[]>();
  for (const image of review.images.slice(0, 100)) {
    if (
      !validPhotoPath(image.path) ||
      !/^[a-f0-9]{64}$/.test(image.sha256) ||
      !Number.isInteger(image.index)
    )
      continue;
    const [session, name] = image.path.split("/");
    const archive = `${REVIEW_PREFIX}${session}`;
    for (const prefix of [archive, session]) {
      if (!cache.has(prefix)) cache.set(prefix, await listReviewFiles(prefix));
      const file = cache
        .get(prefix)!
        .find((file) =>
          prefix === session
            ? file.name === name
            : file.name.match(/^\d{13}-(.+)$/)?.[1] === name,
        );
      if (!file) continue;
      const expires = Math.min(
        limit,
        prefix === session
          ? Date.parse(file.created_at || "") + INPUT_REVIEW_MS
          : Number(file.name.slice(0, 13)),
      );
      const ttl = Math.min(300, Math.floor((expires - now) / 1000));
      if (!Number.isFinite(ttl) || ttl <= 0) continue;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(`${prefix}/${file.name}`, ttl);
      if (!error && data?.signedUrl) {
        result.push({
          index: image.index,
          path: image.path,
          sha256: image.sha256,
          signedUrl: data.signedUrl,
          expiresAt: new Date(expires).toISOString(),
        });
        break;
      }
    }
  }
  return result;
}
