import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  gatewayRequestSchema,
  type Actor,
  type CommandMeta,
} from "../src/ops/contracts/core";
import {
  addIdentifierSchema,
  allocateLotSchema,
  correctItemCostSchema,
  createItemSchema,
  createLotSchema,
  itemDetailSchema,
  lotDetailSchema,
} from "../src/ops/contracts/inventory";
import {
  createLocationSchema,
  inventorySearchSchema,
  locationDeleteSchema,
  locationParentSchema,
  moveItemSchema,
  resolveIdentifierSchema,
} from "../src/ops/contracts/locations";
import { defaultAuthServices, type AuthServices } from "../utils/ops/core/auth";
import { runCommand } from "../utils/ops/core/commands";
import { failure, statusFor } from "../utils/ops/core/errors";
import { can } from "../utils/ops/core/permissions";
import {
  defaultInventoryServices,
  type InventoryServices,
} from "../utils/ops/inventory/intake";
import {
  defaultLocationServices,
  type LocationServices,
} from "../utils/ops/inventory/locations";
import {
  defaultSearchServices,
  type SearchServices,
} from "../utils/ops/inventory/search";
import {
  createCaptureSchema,
  uploadManifestSchema,
  completeUploadSchema,
  finishCaptureSchema,
  pairCaptureSchema,
  reorderMediaSchema,
  retireMediaSchema,
} from "../src/ops/contracts/media";
import {
  defaultMediaServices,
  type MediaServices,
  signUpload,
} from "../utils/ops/media/capture";
import {
  previewImportSchema,
  applyImportSchema,
  exportImportSchema,
} from "../src/ops/contracts/imports";
import {
  defaultImportServices,
  type ImportServices,
} from "../utils/ops/imports/apply";

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
    inventory: InventoryServices;
    locations: LocationServices;
    search: SearchServices;
    media: MediaServices;
    imports: ImportServices;
    payload: unknown;
    key?: string;
    meta?: CommandMeta;
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
  "item.create": {
    kind: "command",
    payload: createItemSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload, meta }) {
      return inventory.createItem(
        actor,
        createItemSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "identifier.add": {
    kind: "command",
    payload: addIdentifierSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload, meta }) {
      return inventory.addIdentifier(
        actor,
        addIdentifierSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "lot.create": {
    kind: "command",
    payload: createLotSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload, meta }) {
      return inventory.createLot(
        actor,
        createLotSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "lot.allocate": {
    kind: "command",
    payload: allocateLotSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload, meta }) {
      return inventory.allocateLotCost(
        actor,
        allocateLotSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "item.cost.correct": {
    kind: "command",
    payload: correctItemCostSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload, meta }) {
      return inventory.correctItemCost(
        actor,
        correctItemCostSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "inventory.list": {
    kind: "query",
    payload: inventorySearchSchema,
    requiresMembership: true,
    async run({ actor, token, search, payload }) {
      return search.listInventory(
        actor,
        inventorySearchSchema.parse(payload),
        token,
      );
    },
  },
  "item.detail": {
    kind: "query",
    payload: itemDetailSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload }) {
      return inventory.itemDetail(
        actor,
        itemDetailSchema.parse(payload).itemId,
        token,
      );
    },
  },
  "lot.detail": {
    kind: "query",
    payload: lotDetailSchema,
    requiresMembership: true,
    async run({ actor, token, inventory, payload }) {
      return inventory.lotDetail(
        actor,
        lotDetailSchema.parse(payload).lotId,
        token,
      );
    },
  },
  "scan.resolve": {
    kind: "query",
    payload: resolveIdentifierSchema,
    requiresMembership: true,
    async run({ actor, token, search, payload }) {
      return search.resolveIdentifier(
        actor,
        resolveIdentifierSchema.parse(payload).code,
        token,
      );
    },
  },
  "location.list": {
    kind: "query",
    payload: emptyPayload,
    requiresMembership: true,
    async run({ actor, token, search }) {
      return search.listLocations(actor, token);
    },
  },
  "location.create": {
    kind: "command",
    payload: createLocationSchema,
    requiresMembership: true,
    async run({ actor, token, locations, payload, meta }) {
      return locations.createLocation(
        actor,
        createLocationSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "location.parent": {
    kind: "command",
    payload: locationParentSchema,
    requiresMembership: true,
    async run({ actor, token, locations, payload, meta }) {
      return locations.setParent(
        actor,
        locationParentSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "location.delete": {
    kind: "command",
    payload: locationDeleteSchema,
    requiresMembership: true,
    async run({ actor, token, locations, payload, meta }) {
      return locations.deleteLocation(
        actor,
        locationDeleteSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "item.move": {
    kind: "command",
    payload: moveItemSchema,
    requiresMembership: true,
    async run({ actor, token, locations, payload, meta }) {
      return locations.moveItem(
        actor,
        moveItemSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "capture.create": {
    kind: "command",
    payload: createCaptureSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload, meta }) {
      return media.createCaptureSession(
        actor,
        createCaptureSchema.parse(payload).itemId,
        meta!,
        token,
      );
    },
  },
  "capture.manifest": {
    kind: "command",
    payload: uploadManifestSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload, meta }) {
      return media.createUploadManifest(
        actor,
        uploadManifestSchema.parse(payload),
        meta!,
        token,
      );
    },
  },
  "capture.finish": {
    kind: "command",
    payload: finishCaptureSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload, meta }) {
      return media.finishCapture(
        actor,
        finishCaptureSchema.parse(payload).sessionId,
        meta!,
        token,
      );
    },
  },
  "capture.pair": {
    kind: "command",
    payload: pairCaptureSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload }) {
      return media.createPairing(
        actor,
        pairCaptureSchema.parse(payload).sessionId,
        token,
      );
    },
  },
  "media.sign": {
    kind: "query",
    payload: z.object({ uploadId: z.string().uuid() }).strict(),
    requiresMembership: true,
    async run({ actor, payload }) {
      return signUpload(
        actor.workspaceId,
        (payload as { uploadId: string }).uploadId,
      );
    },
  },
  "media.complete": {
    kind: "command",
    payload: completeUploadSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload }) {
      return media.completeUpload(
        actor,
        completeUploadSchema.parse(payload),
        token,
      );
    },
  },
  "media.list": {
    kind: "query",
    payload: z.object({ itemId: z.string().uuid() }).strict(),
    requiresMembership: true,
    async run({ actor, media, payload }) {
      return media.listMedia(actor, (payload as { itemId: string }).itemId);
    },
  },
  "media.reorder": {
    kind: "command",
    payload: reorderMediaSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload, meta }) {
      const input = reorderMediaSchema.parse(payload);
      return media.reorderMedia(
        actor,
        input.itemId,
        input.orderedIds,
        meta!,
        token,
      );
    },
  },
  "media.retire": {
    kind: "command",
    payload: retireMediaSchema,
    requiresMembership: true,
    async run({ actor, token, media, payload, meta }) {
      return media.retireMedia(
        actor,
        retireMediaSchema.parse(payload).uploadId,
        meta!,
        token,
      );
    },
  },
  "import.preview": {
    kind: "command",
    payload: previewImportSchema,
    requiresMembership: true,
    async run({ actor, imports, payload, token }) {
      const input = previewImportSchema.parse(payload);
      return imports.previewImport(actor, input.fileId, input.mapping, token);
    },
  },
  "import.apply": {
    kind: "command",
    payload: applyImportSchema,
    requiresMembership: true,
    async run({ actor, imports, token, payload, meta }) {
      return imports.applyImport(
        actor,
        applyImportSchema.parse(payload).importId,
        meta!,
        token,
      );
    },
  },
  "import.detail": {
    kind: "query",
    payload: exportImportSchema,
    requiresMembership: true,
    async run({ actor, imports, payload }) {
      return imports.detail(actor, exportImportSchema.parse(payload).importId);
    },
  },
  "import.export": {
    kind: "query",
    payload: exportImportSchema,
    requiresMembership: true,
    async run({ actor, imports, payload }) {
      return imports.exportImportResults(
        actor,
        exportImportSchema.parse(payload).importId,
      );
    },
  },
};

export function createOpsHandler(
  services: AuthServices,
  inventory: InventoryServices = defaultInventoryServices,
  search: SearchServices = defaultSearchServices,
  locations: LocationServices = defaultLocationServices,
  media: MediaServices = defaultMediaServices,
  imports: ImportServices = defaultImportServices,
) {
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
          inventory,
          search,
          locations,
          media,
          imports,
          payload: request.payload,
          key: request.meta?.idempotencyKey,
          meta: request.meta,
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
