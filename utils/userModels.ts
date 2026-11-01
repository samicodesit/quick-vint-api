import { randomUUID } from "node:crypto";
import { warmRearModel, listingPhotosEnabled } from "./listingPhotoJobs";
import { supabase } from "./supabaseClient";
import {
  MODEL_CATALOG_VERSION,
  MODEL_PROMPT_VERSION,
  parseModelPreferences,
  resolveModelScene,
  sceneFingerprint,
} from "./userModelCatalog";
import {
  runModelOperation,
  generateModelImage,
  checkModelImage,
  uploadModelImage,
  MODEL_BUCKET,
} from "./userModelGeneration";
export class UserModelError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function modelMutate(
  user: string,
  action: string,
  input: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc("user_model_mutate", {
    p_user_id: user,
    p_action: action,
    p_input: input,
  });
  if (error) {
    if (error.message?.includes("model_retry_limit"))
      throw new UserModelError(
        429,
        "model_retry_limit",
        "Creation could not be completed. Contact support for help.",
      );
    if (error.message?.includes("model_retry_wait"))
      throw new UserModelError(
        429,
        "model_retry_wait",
        "Wait 30 seconds before trying again.",
      );
    if (error.message?.includes("model_erasing"))
      throw new UserModelError(
        409,
        "model_erasing",
        "This account is being deleted.",
      );
    if (error.message?.includes("model_not_ready"))
      throw new UserModelError(
        409,
        "model_not_ready",
        "Create your model first.",
      );
    throw error;
  }
  return data;
}
export async function createUserModel(user: string, raw: unknown) {
  const preferences = parseModelPreferences(raw);
  const seed = randomUUID();
  const scene = resolveModelScene(seed);
  return modelMutate(user, "create", {
    preferences,
    seed,
    scene,
    fingerprint: sceneFingerprint(scene),
    promptVersion: MODEL_PROMPT_VERSION,
    catalogVersion: MODEL_CATALOG_VERSION,
  });
}
export async function getUserModel(user: string) {
  const result = await modelMutate(user, "get");
  if (!result)
    throw new UserModelError(401, "account_changed", "Sign in again.");
  const row = result.model;
  let imageUrl: string | null = null;
  if (row?.state === "ready" && row.object_key) {
    const { data, error } = await supabase.storage
      .from(MODEL_BUCKET)
      .createSignedUrl(row.object_key, 600);
    if (error) throw error;
    imageUrl = data.signedUrl;
  }
  return {
    listingPhotosAvailable: listingPhotosEnabled(),
    invitationState: result.invitationState,
    enabled: result.enabled,
    model: row
      ? {
          id: row.id,
          state: row.state,
          operationId: row.operation_id,
          preferences: row.preferences,
          imageUrl,
          imageExpiresAt: imageUrl
            ? new Date(Date.now() + 600000).toISOString()
            : null,
          width: row.width,
          height: row.height,
          canRetry: row.state === "failed" && row.total_attempts < 6,
          retryAfter:
            row.state === "failed"
              ? new Date(Date.parse(row.updated_at) + 30000).toISOString()
              : null,
          errorCode: row.error_code,
          createdAt: row.created_at,
        }
      : null,
  };
}
export async function processUserModel(user: string, operationId: string) {
  await runModelOperation(user, operationId, {
    mutate: modelMutate,
    generate: generateModelImage,
    check: checkModelImage,
    upload: uploadModelImage,
  });
  warmRearModel(user);
}
export async function cleanUserModelObjects() {
  const { data, error } = await supabase
    .from("user_model_attempts")
    .select("id,object_key")
    .not("object_key", "like", "removed/%")
    .or("user_id.is.null,cleanup_after.lte." + new Date().toISOString())
    .lt("created_at", new Date(Date.now() - 600000).toISOString())
    .limit(100);
  if (error) throw error;
  let count = 0;
  for (const row of data || []) {
    // Never remove an accepted model that still belongs to an account.
    const { data: ready, error: readyError } = await supabase
      .from("user_models")
      .select("id")
      .eq("object_key", row.object_key)
      .eq("state", "ready")
      .maybeSingle();
    if (readyError) throw readyError;
    if (ready) continue;
    const removed = await supabase.storage
      .from(MODEL_BUCKET)
      .remove([row.object_key]);
    if (removed.error) throw removed.error;
    const deleted = await supabase
      .from("user_model_attempts")
      .update({ cleanup_after: null, object_key: "removed/" + row.id })
      .eq("id", row.id);
    if (deleted.error) throw deleted.error;
    count++;
  }
  return count;
}
