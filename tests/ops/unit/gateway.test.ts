import { describe, expect, it } from "vitest";
import { callOps } from "../../../src/ops/app/gateway";

describe("workspace browser gateway", () => {
  it("sends a bearer token and stable command metadata", async () => {
    let sent: { headers: Record<string, string>; body: string } | undefined;
    const fetcher = async (
      _url: string,
      options: { headers: Record<string, string>; body: string },
    ) => {
      sent = options;
      return { json: async () => ({ ok: true, data: { workspaceId: "w" } }) };
    };
    await callOps(fetcher, "token", {
      kind: "command",
      name: "workspace.bootstrap",
      workspaceId: "00000000-0000-0000-0000-000000000000",
      payload: { name: "Seller" },
      meta: {
        idempotencyKey: "c0000000-0000-4000-8000-000000000010",
        expectedVersion: null,
      },
    });
    expect(sent?.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(sent!.body).meta.idempotencyKey).toBe(
      "c0000000-0000-4000-8000-000000000010",
    );
  });

  it("refuses an absent session token", async () => {
    await expect(
      callOps(
        async () => {
          throw new Error("network should not be called");
        },
        "",
        {
          kind: "query",
          name: "workspace.list",
          workspaceId: "00000000-0000-0000-0000-000000000000",
          payload: {},
        },
      ),
    ).rejects.toThrow(/session/i);
  });
});
