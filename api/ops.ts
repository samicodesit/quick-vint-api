import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { gatewayRequestSchema, type Actor } from "../src/ops/contracts/core";
import { defaultAuthServices, type AuthServices } from "../utils/ops/core/auth";
import { runCommand } from "../utils/ops/core/commands";
import { failure, statusFor } from "../utils/ops/core/errors";
import { can } from "../utils/ops/core/permissions";

const bootstrapPayload = z.object({ name: z.string().trim().min(1).max(120) });
const emptyPayload = z.object({}).strict();
const NIL_WORKSPACE = "00000000-0000-0000-0000-000000000000";

type Operation = {
  kind: "query" | "command";
  payload: z.ZodTypeAny;
  requiresMembership: boolean;
  run: (context: {
    actor: Actor;
    token: string;
    services: AuthServices;
    payload: unknown;
    key?: string;
  }) => Promise<unknown>;
};

const operations: Record<string, Operation> = {
  "session.read": {
    kind: "query",
    payload: emptyPayload,
    requiresMembership: true,
    async run({ actor }) {
      return { workspaceId: actor.workspaceId, role: actor.role };
    },
  },
  "workspace.bootstrap": {
    kind: "command",
    payload: bootstrapPayload,
    requiresMembership: false,
    async run({ token, services, payload, key }) {
      const { name } = bootstrapPayload.parse(payload);
      return { workspaceId: await services.bootstrap(token, name, key!) };
    },
  },
  "workspace.list": {
    kind: "query",
    payload: emptyPayload,
    requiresMembership: false,
    async run({ actor, services }) {
      return services.listWorkspaces(actor.userId);
    },
  },
};

export function createOpsHandler(services: AuthServices) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const requestId = randomUUID();
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST")
      return res
        .status(405)
        .json(failure("VALIDATION", "POST required", requestId));
    if (req.headers.origin) {
      let origin: URL;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        return res
          .status(403)
          .json(failure("FORBIDDEN", "Origin not allowed", requestId));
      }
      if (
        !["http:", "https:"].includes(origin.protocol) ||
        origin.host !== req.headers.host
      ) {
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
    const parsed = gatewayRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json(failure("VALIDATION", "Invalid request", requestId));
    const request = parsed.data;
    const operation = operations[request.name];
    if (!operation || operation.kind !== request.kind)
      return res
        .status(400)
        .json(failure("VALIDATION", "Unknown operation", requestId));
    if (!operation.payload.safeParse(request.payload).success)
      return res
        .status(400)
        .json(failure("VALIDATION", "Invalid payload", requestId));
    if (request.kind === "command" && !request.meta)
      return res
        .status(400)
        .json(failure("VALIDATION", "Command metadata required", requestId));
    if (!operation.requiresMembership && request.workspaceId !== NIL_WORKSPACE)
      return res
        .status(400)
        .json(failure("VALIDATION", "Workspace ID must be empty", requestId));
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "");
    if (!match)
      return res
        .status(401)
        .json(failure("UNAUTHENTICATED", "Sign in required", requestId));
    try {
      const identity = await services.authenticate(match[1]);
      if (!identity)
        return res
          .status(401)
          .json(failure("UNAUTHENTICATED", "Sign in required", requestId));
      const role = operation.requiresMembership
        ? await services.membership(identity.userId, request.workspaceId)
        : "owner";
      if (!role)
        return res
          .status(403)
          .json(failure("FORBIDDEN", "Workspace access denied", requestId));
      const actor = {
        userId: identity.userId,
        workspaceId: request.workspaceId,
        role,
      } as Actor;
      if (!can(actor, request.name))
        return res
          .status(403)
          .json(failure("FORBIDDEN", "Operation denied", requestId));
      const run = () =>
        operation.run({
          actor,
          token: match[1],
          services,
          payload: request.payload,
          key: request.meta?.idempotencyKey,
        });
      const result =
        request.kind === "command"
          ? await runCommand(actor, request.meta!, run, requestId)
          : { ok: true as const, data: await run(), requestId };
      return res
        .status(result.ok ? 200 : statusFor(result.error.code))
        .json(result);
    } catch (error) {
      const code = (error as { opsCode?: "CONFLICT" }).opsCode ?? "RETRYABLE";
      return res
        .status(statusFor(code))
        .json(
          failure(
            code,
            code === "CONFLICT"
              ? "Idempotency key conflict"
              : "Request could not be completed",
            requestId,
          ),
        );
    }
  };
}

export default createOpsHandler(defaultAuthServices);
