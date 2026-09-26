import { describe, expect, it } from "vitest";
import { createAdapter } from "../../../utils/ops/integrations/adapter";

const context = {
  workspaceId: "c0000000-0000-4000-8000-000000000001",
  channelAccountId: "c0000000-0000-4000-8000-000000000002",
};

describe("T02 marketplace capability boundary", () => {
  it("returns typed unsupported results for unverified manual capabilities", async () => {
    const adapter = createAdapter("manual", "production");
    expect((await adapter.capabilities(context)).publish.supported).toBe(false);
    expect(await adapter.listOrders(context, null)).toMatchObject({
      ok: false,
      code: "UNSUPPORTED",
    });
  });

  it("blocks fixture mode outside local and test environments", () => {
    expect(() => createAdapter("fixture", "production")).toThrow(/fixture/i);
    expect(() => createAdapter("fixture", "test")).not.toThrow();
  });
});
