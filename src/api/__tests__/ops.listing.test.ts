import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createOpsHandler } from "../../../api/ops";

const workspaceId = "c0000000-0000-4000-8000-000000000801";
const userId = "a0000000-0000-4000-8000-000000000801";
const itemId = "b0000000-0000-4000-8000-000000000801";
function response() {
  const state = { status: 200, body: null as unknown };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return { state, res: res as unknown as VercelResponse };
}
function request(name: string, payload: unknown) {
  return {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      origin: "https://autolister.app",
      host: "autolister.app",
      "content-type": "application/json",
    },
    body: {
      kind: "command",
      name,
      workspaceId,
      payload,
      meta: {
        idempotencyKey: "d0000000-0000-4000-8000-000000000801",
        expectedVersion: null,
      },
    },
  } as unknown as VercelRequest;
}
function handler(role: "owner" | "warehouse") {
  return createOpsHandler({
    authenticate: async () => ({ userId, email: "fixture@example.test" }),
    membership: async () => role,
    bootstrap: async () => workspaceId,
    listWorkspaces: async () => [],
  });
}

describe("T08 listing API gate", () => {
  it("rejects model-shaped facts before any database write", async () => {
    const result = response();
    await handler("owner")(
      request("facts.confirm", {
        itemId,
        factRevision: 0,
        values: { brand: "Acme", confidence: 0.99 },
      }),
      result.res,
    );
    expect(result.state.body).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });
  it("denies warehouse approval before the service path", async () => {
    const result = response();
    await handler("warehouse")(
      request("listing.approve", {
        listingId: itemId,
        revisionId: itemId,
        expectedListingVersion: 1,
      }),
      result.res,
    );
    expect(result.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});
