import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  completeUploadSchema,
  uploadManifestSchema,
} from "../src/ops/contracts/media";
import { OpsError, failure, statusFor } from "../utils/ops/core/errors";
import {
  completeUpload,
  pairedManifest,
  pairingScope,
  redeemPairing,
  signUpload,
} from "../utils/ops/media/capture";

const secret = z.string().min(32).max(128);
const requests = z.discriminatedUnion("action", [
  z.object({ action: z.literal("redeem"), token: secret }).strict(),
  z
    .object({
      action: z.literal("manifest"),
      grant: secret,
      input: uploadManifestSchema,
      idempotencyKey: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("sign"),
      grant: secret,
      uploadId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      grant: secret,
      input: completeUploadSchema,
    })
    .strict(),
]);

type UploadServices = {
  redeemPairing: typeof redeemPairing;
  pairedManifest: typeof pairedManifest;
  pairingScope: typeof pairingScope;
  signUpload: typeof signUpload;
  completeUpload: typeof completeUpload;
};

export function createUploadHandler(services: UploadServices) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const requestId = randomUUID();
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST")
      return res
        .status(405)
        .json(failure("VALIDATION", "POST required", requestId));
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          return res
            .status(403)
            .json(failure("FORBIDDEN", "Origin not allowed", requestId));
      } catch {
        return res
          .status(403)
          .json(failure("FORBIDDEN", "Origin not allowed", requestId));
      }
    }
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return res
        .status(415)
        .json(failure("VALIDATION", "JSON required", requestId));
    if (Buffer.byteLength(JSON.stringify(req.body ?? null)) > 65_536)
      return res
        .status(413)
        .json(failure("VALIDATION", "Request too large", requestId));
    const parsed = requests.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json(failure("VALIDATION", "Invalid upload request", requestId));
    try {
      const input = parsed.data;
      let data: unknown;
      if (input.action === "redeem")
        data = await services.redeemPairing(input.token);
      if (input.action === "manifest")
        data = await services.pairedManifest(
          input.grant,
          input.input,
          input.idempotencyKey,
        );
      if (input.action === "sign") {
        const scope = await services.pairingScope(input.grant, input.uploadId);
        data = await services.signUpload(scope.workspaceId, input.uploadId);
      }
      if (input.action === "complete") {
        const scope = await services.pairingScope(
          input.grant,
          input.input.uploadId,
        );
        data = await services.completeUpload(scope.workspaceId, input.input);
      }
      return res.status(200).json({ ok: true, data, requestId });
    } catch (error) {
      const code = error instanceof OpsError ? error.code : "RETRYABLE";
      return res
        .status(statusFor(code))
        .json(
          failure(
            code,
            error instanceof OpsError
              ? error.message
              : "Upload request could not be completed",
            requestId,
          ),
        );
    }
  };
}

export default createUploadHandler({
  redeemPairing,
  pairedManifest,
  pairingScope,
  signUpload,
  completeUpload,
});
