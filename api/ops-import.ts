import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { defaultAuthServices, type AuthServices } from "../utils/ops/core/auth";
import { failure, OpsError, statusFor } from "../utils/ops/core/errors";
import { stageImport } from "../utils/ops/imports/apply";

const requestSchema = z
  .object({
    name: z.string().min(1).max(255),
    csv: z.string().min(1).max(4_000_000),
  })
  .strict();
export function createImportUploadHandler(
  auth: AuthServices,
  stage = stageImport,
) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const requestId = randomUUID();
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST")
      return res
        .status(405)
        .json(failure("VALIDATION", "POST required", requestId));
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (
          !["http:", "https:"].includes(origin.protocol) ||
          origin.host !== req.headers.host
        )
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
    if (Buffer.byteLength(JSON.stringify(req.body ?? null)) > 4_100_000)
      return res
        .status(413)
        .json(failure("VALIDATION", "CSV exceeds upload limit", requestId));
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json(failure("VALIDATION", "Invalid CSV upload", requestId));
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "");
    if (!match)
      return res
        .status(401)
        .json(failure("UNAUTHENTICATED", "Sign in required", requestId));
    const workspace = z
      .string()
      .uuid()
      .safeParse(req.headers["x-ops-workspace-id"]);
    if (!workspace.success)
      return res
        .status(400)
        .json(failure("VALIDATION", "Workspace required", requestId));
    try {
      const identity = await auth.authenticate(match[1]);
      if (!identity)
        return res
          .status(401)
          .json(failure("UNAUTHENTICATED", "Sign in required", requestId));
      const workspaceId = workspace.data;
      const role = await auth.membership(identity.userId, workspaceId);
      if (role !== "owner" && role !== "manager")
        return res
          .status(403)
          .json(failure("FORBIDDEN", "Import requires a manager", requestId));
      const data = await stage(
        { userId: identity.userId, workspaceId, role },
        parsed.data.name,
        parsed.data.csv,
      );
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
              : "Import could not be saved",
            requestId,
          ),
        );
    }
  };
}
export default createImportUploadHandler(defaultAuthServices);
