export const MODEL_PHOTO_CONTENT_ENABLED =
  process.env.MODEL_PHOTO_CONTENT_ENABLED === "1";

export function applyModelContentHold<
  T extends { draft: boolean; releaseGroup?: string },
>(post: T, enabled = MODEL_PHOTO_CONTENT_ENABLED): T {
  return {
    ...post,
    draft: post.draft || (post.releaseGroup === "model-photos" && !enabled),
  };
}
