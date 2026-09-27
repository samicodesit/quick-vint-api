import { expect, it } from "vitest";
import { browserExtensionTransport } from "../../../src/ops/app/features/listings/bridge";

it("sends a staging handoff to the configured unpacked extension ID", async () => {
  let recipient = "";
  const chrome = {
    runtime: {
      sendMessage(id: string, _message: unknown, callback: (value: unknown) => void) {
        recipient = id;
        callback({ ok: true });
      },
    },
  };
  const transport = browserExtensionTransport(chrome, "abcdefghijklmnopabcdefghijklmnop");
  await expect(transport?.({ type: "OPS_HELLO" })).resolves.toEqual({ ok: true });
  expect(recipient).toBe("abcdefghijklmnopabcdefghijklmnop");
});
