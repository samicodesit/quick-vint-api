import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  completeUploadSchema,
  uploadManifestSchema,
} from "../../../src/ops/contracts/media";
import { check, userClient } from "../inventory/intake";
import { OpsError } from "../core/errors";
import { processOriginal } from "./image";

type UploadManifest = z.infer<typeof uploadManifestSchema>;
type CompleteUpload = z.infer<typeof completeUploadSchema>;
type UploadRow = {
  id: string;
  workspace_id: string;
  item_id: string;
  session_id: string;
  declared_mime: string;
  declared_bytes: number;
  declared_sha256: string;
  original_path: string;
  derivative_path: string | null;
  state: string;
  position: number;
};
const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("OS Supabase service configuration is incomplete");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadUpload(
  workspaceId: string,
  uploadId: string,
): Promise<UploadRow> {
  const { data, error } = await serviceClient()
    .from("ops_media_assets")
    .select(
      "id,workspace_id,item_id,session_id,declared_mime,declared_bytes,declared_sha256,original_path,derivative_path,state,position",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", uploadId)
    .maybeSingle();
  check(error);
  if (!data) throw new OpsError("NOT_FOUND", "Upload not found in workspace");
  return data as UploadRow;
}

export async function signUpload(workspaceId: string, uploadId: string) {
  const row = await loadUpload(workspaceId, uploadId);
  if (row.state === "available") return { uploadId, state: "available" };
  const { data, error } = await serviceClient()
    .storage.from("ops-originals")
    .createSignedUploadUrl(row.original_path, { upsert: false });
  check(error);
  return {
    uploadId,
    state: row.state,
    path: row.original_path,
    signature: data!.token,
    tusEndpoint: `${process.env.VERCEL_APP_SUPABASE_URL}/storage/v1/upload/resumable`,
  };
}

export async function completeUpload(
  workspaceId: string,
  input: CompleteUpload,
) {
  const row = await loadUpload(workspaceId, input.uploadId);
  if (row.state === "available") {
    if (row.declared_sha256 !== input.checksum)
      throw new OpsError("CONFLICT", "Upload checksum conflict");
    return { uploadId: row.id, itemId: row.item_id, state: "available" };
  }
  const storage = serviceClient().storage;
  const { data, error } = await storage
    .from("ops-originals")
    .download(row.original_path);
  check(error);
  if (!data)
    throw new OpsError("RETRYABLE", "Original upload is not available yet");
  const original = Buffer.from(await data.arrayBuffer());
  const processed = await processOriginal(original, row.declared_mime);
  if (
    processed.checksum !== input.checksum ||
    processed.checksum !== row.declared_sha256 ||
    processed.bytes !== row.declared_bytes
  )
    throw new OpsError(
      "VALIDATION",
      "Uploaded photo does not match its manifest",
    );
  const derivativePath = `${workspaceId}/${row.item_id}/${row.id}.webp`;
  const { error: derivativeError } = await storage
    .from("ops-derivatives")
    .upload(derivativePath, processed.derivative, {
      contentType: "image/webp",
      upsert: true,
    });
  check(derivativeError);
  const { data: result, error: updateError } = await serviceClient().rpc(
    "ops_complete_upload",
    {
      p_workspace_id: workspaceId,
      p_upload_id: row.id,
      p_sha256: processed.checksum,
      p_actual_bytes: processed.bytes,
      p_mime: processed.mime,
      p_derivative_path: derivativePath,
    },
  );
  check(updateError);
  return result;
}

export type MediaServices = {
  createCaptureSession(
    actor: Actor,
    itemId: string,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  createUploadManifest(
    actor: Actor,
    input: UploadManifest,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  completeUpload(
    actor: Actor,
    input: CompleteUpload,
    token: string,
  ): Promise<unknown>;
  finishCapture(
    actor: Actor,
    sessionId: string,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  createPairing(
    actor: Actor,
    sessionId: string,
    token: string,
  ): Promise<unknown>;
  listMedia(actor: Actor, itemId: string): Promise<unknown>;
  reorderMedia(
    actor: Actor,
    itemId: string,
    orderedIds: string[],
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
  retireMedia(
    actor: Actor,
    uploadId: string,
    meta: CommandMeta,
    token: string,
  ): Promise<unknown>;
};

export const defaultMediaServices: MediaServices = {
  async createCaptureSession(actor, itemId, meta, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_create_capture_session",
      {
        p_workspace_id: actor.workspaceId,
        p_item_id: itemId,
        p_key: meta.idempotencyKey,
      },
    );
    check(error);
    return data;
  },
  async createUploadManifest(actor, input, meta, token) {
    const { data, error } = await userClient(token).rpc(
      "ops_create_upload_manifest",
      {
        p_workspace_id: actor.workspaceId,
        p_session_id: input.sessionId,
        p_files: input.files,
        p_key: meta.idempotencyKey,
      },
    );
    check(error);
    return data;
  },
  async completeUpload(actor, input) {
    return completeUpload(actor.workspaceId, input);
  },
  async finishCapture(actor, sessionId, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_finish_capture", {
      p_workspace_id: actor.workspaceId,
      p_session_id: sessionId,
      p_key: meta.idempotencyKey,
    });
    check(error);
    return data;
  },
  async createPairing(actor, sessionId, token) {
    const secret = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { data, error } = await userClient(token).rpc(
      "ops_create_capture_pairing",
      {
        p_workspace_id: actor.workspaceId,
        p_session_id: sessionId,
        p_token_hash: hash(secret),
        p_expires_at: expiresAt,
      },
    );
    check(error);
    return { ...data, secret, scope: "upload" };
  },
  async listMedia(actor, itemId) {
    const { data, error } = await serviceClient()
      .from("ops_media_assets")
      .select(
        "id,session_id,item_id,original_name,detected_mime,declared_bytes,position,state,error_code,derivative_path",
      )
      .eq("workspace_id", actor.workspaceId)
      .eq("item_id", itemId)
      .neq("state", "retired")
      .order("position");
    check(error);
    return Promise.all(
      (data ?? []).map(async (row) => {
        if (!row.derivative_path || row.state !== "available")
          return { ...row, derivative_path: undefined };
        const { data: signature, error: signatureError } = await serviceClient()
          .storage.from("ops-derivatives")
          .createSignedUrl(row.derivative_path, 300);
        check(signatureError);
        return {
          ...row,
          derivative_path: undefined,
          thumbnailUrl: signature?.signedUrl,
        };
      }),
    );
  },
  async reorderMedia(actor, itemId, orderedIds, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_reorder_media", {
      p_workspace_id: actor.workspaceId,
      p_item_id: itemId,
      p_ids: orderedIds,
      p_key: meta.idempotencyKey,
    });
    check(error);
    return data;
  },
  async retireMedia(actor, uploadId, meta, token) {
    const { data, error } = await userClient(token).rpc("ops_retire_media", {
      p_workspace_id: actor.workspaceId,
      p_upload_id: uploadId,
      p_key: meta.idempotencyKey,
    });
    check(error);
    return data;
  },
};

export async function redeemPairing(secret: string) {
  const grant = randomBytes(32).toString("base64url");
  const { data, error } = await serviceClient().rpc(
    "ops_redeem_capture_pairing",
    { p_token_hash: hash(secret), p_grant_hash: hash(grant) },
  );
  check(error);
  return { ...data, grant };
}

export async function pairingScope(grant: string, uploadId?: string) {
  const { data, error } = await serviceClient()
    .from("ops_capture_pairings")
    .select("workspace_id,session_id,grant_expires_at,created_by")
    .eq("grant_hash", hash(grant))
    .gt("grant_expires_at", new Date().toISOString())
    .maybeSingle();
  check(error);
  if (!data) throw new OpsError("FORBIDDEN", "Upload grant expired");
  const { data: owner, error: ownerError } = await serviceClient()
    .from("ops_memberships")
    .select("user_id")
    .eq("workspace_id", data.workspace_id)
    .eq("user_id", data.created_by)
    .eq("active", true)
    .maybeSingle();
  check(ownerError);
  if (!owner)
    throw new OpsError("FORBIDDEN", "Pairing owner no longer authorised");
  if (uploadId) {
    const row = await loadUpload(data.workspace_id, uploadId);
    if (row.session_id !== data.session_id)
      throw new OpsError("FORBIDDEN", "Upload belongs to another capture");
  }
  return {
    workspaceId: data.workspace_id as string,
    sessionId: data.session_id as string,
  };
}

export async function pairedManifest(
  grant: string,
  input: UploadManifest,
  key: string,
) {
  const scope = await pairingScope(grant);
  if (scope.sessionId !== input.sessionId)
    throw new OpsError("FORBIDDEN", "Capture session mismatch");
  const { data, error } = await serviceClient().rpc(
    "ops_pairing_upload_manifest",
    { p_grant_hash: hash(grant), p_files: input.files, p_key: key },
  );
  check(error);
  return data;
}
