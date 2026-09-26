import { describe, expect, it } from "vitest";
import {
  prepareWithExtension,
  type HandoffPacket,
} from "../../../src/ops/app/features/listings/bridge";

const packet: HandoffPacket = {
  protocolVersion: 1,
  workspaceId: "c0000000-0000-4000-8000-000000000901",
  itemId: "c0000000-0000-4000-8000-000000000902",
  listingId: "c0000000-0000-4000-8000-000000000903",
  revisionId: "c0000000-0000-4000-8000-000000000904",
  reference: "SKU-1",
  title: "Coat",
  description: "Confirmed",
  price: { minor: 1000, currency: "EUR" },
  photos: [],
  state: "prepared",
};
const userId = "a0000000-0000-4000-8000-000000000901";
const requestId = "c0000000-0000-4000-8000-000000000905";

describe("T09 browser extension handshake", () => {
  it("falls back to manual when version or account differs", async () => {
    expect(
      (
        await prepareWithExtension(
          async () => ({ ok: true, version: 2, userId }),
          packet,
          userId,
          requestId,
        )
      ).state,
    ).toBe("prepared");
    expect(
      (
        await prepareWithExtension(
          async () => ({ ok: true, version: 1, userId: "other" }),
          packet,
          userId,
          requestId,
        )
      ).reason,
    ).toMatch(/different/);
  });
  it("binds filled acknowledgement to the exact workspace, item and revision", async () => {
    let calls = 0;
    const transport = async (message: unknown) => {
      calls++;
      if ((message as { type: string }).type === "OPS_HELLO")
        return { ok: true, version: 1, userId };
      expect(message).toMatchObject({
        type: "OPS_PREPARE_LISTING",
        workspaceId: packet.workspaceId,
        itemId: packet.itemId,
        listingId: packet.listingId,
        revisionId: packet.revisionId,
      });
      return {
        ok: true,
        state: "filled",
        workspaceId: packet.workspaceId,
        itemId: packet.itemId,
        listingId: packet.listingId,
        revisionId: packet.revisionId,
      };
    };
    expect(
      (await prepareWithExtension(transport, packet, userId, requestId)).state,
    ).toBe("filled");
    expect(calls).toBe(2);
    const wrongRevision = await prepareWithExtension(
      async (message) =>
        (message as { type: string }).type === "OPS_HELLO"
          ? { ok: true, version: 1, userId }
          : {
              ok: true,
              state: "filled",
              workspaceId: packet.workspaceId,
              itemId: packet.itemId,
              listingId: packet.listingId,
              revisionId: packet.itemId,
            },
      packet,
      userId,
      requestId,
    );
    expect(wrongRevision.state).toBe("prepared");
  });
});
