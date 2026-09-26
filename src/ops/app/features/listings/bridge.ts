const EXTENSION_ID = "mommklhpammnlojjobejddmidmdcalcl";
export const PROTOCOL_VERSION = 1;

export type HandoffPacket = {
  protocolVersion: number;
  workspaceId: string;
  itemId: string;
  listingId: string;
  revisionId: string;
  reference: string;
  title: string;
  description: string;
  price: { minor: number; currency: string };
  photos: { assetId: string; downloadUrl: string }[];
  state: "prepared";
};
type ChromeBridge = {
  runtime?: {
    lastError?: { message?: string };
    sendMessage: (
      id: string,
      message: unknown,
      callback: (response: unknown) => void,
    ) => void;
  };
};
type Transport = (message: unknown) => Promise<unknown>;

export function browserExtensionTransport(
  chromeObject: ChromeBridge | undefined = (
    globalThis as typeof globalThis & { chrome?: ChromeBridge }
  ).chrome,
): Transport | null {
  if (!chromeObject?.runtime?.sendMessage) return null;
  return (message) =>
    new Promise((resolve, reject) => {
      chromeObject.runtime!.sendMessage(EXTENSION_ID, message, (response) => {
        const error = chromeObject.runtime?.lastError;
        if (error) reject(new Error(error.message ?? "Extension unavailable"));
        else resolve(response);
      });
    });
}

export async function prepareWithExtension(
  transport: Transport,
  packet: HandoffPacket,
  expectedUserId: string,
  requestId: string,
) {
  const hello = (await transport({
    type: "OPS_HELLO",
    version: PROTOCOL_VERSION,
    requestId,
  })) as { ok?: boolean; version?: number; userId?: string } | null;
  if (!hello?.ok || hello.version !== PROTOCOL_VERSION)
    return {
      state: "prepared" as const,
      reason: "Extension version is not compatible. Use manual handoff.",
    };
  if (hello.userId !== expectedUserId)
    return {
      state: "prepared" as const,
      reason: "The extension is signed into a different AutoLister account.",
    };
  const result = (await transport({
    type: "OPS_PREPARE_LISTING",
    version: PROTOCOL_VERSION,
    requestId,
    workspaceId: packet.workspaceId,
    itemId: packet.itemId,
    listingId: packet.listingId,
    revisionId: packet.revisionId,
  })) as {
    ok?: boolean;
    state?: string;
    workspaceId?: string;
    itemId?: string;
    listingId?: string;
    revisionId?: string;
    reason?: string;
  } | null;
  if (
    !result?.ok ||
    result.workspaceId !== packet.workspaceId ||
    result.itemId !== packet.itemId ||
    result.listingId !== packet.listingId ||
    result.revisionId !== packet.revisionId
  )
    return {
      state: "prepared" as const,
      reason:
        result?.reason ??
        "Extension handoff did not match this listing. Use manual handoff.",
    };
  return {
    state:
      result.state === "filled" ? ("filled" as const) : ("prepared" as const),
    reason: result.reason ?? null,
  };
}
