import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createOpsHandler } from "../../../api/ops";

const workspaceId = "c0000000-0000-4000-8000-000000000901";
const itemId = "c0000000-0000-4000-8000-000000000902";
const listingId = "c0000000-0000-4000-8000-000000000903";
const revisionId = "c0000000-0000-4000-8000-000000000904";
const extensionOrigin = "chrome-extension://mommklhpammnlojjobejddmidmdcalcl";
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
function request(origin: string, name = "handoff.packet") {
  return {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      origin,
      host: "autolister.app",
      "content-type": "application/json",
    },
    body: {
      kind: "query",
      name,
      workspaceId,
      payload: { itemId, listingId, revisionId },
    },
  } as unknown as VercelRequest;
}
const handler = createOpsHandler({
  authenticate: async () => ({
    userId: "a0000000-0000-4000-8000-000000000901",
    email: "fixture@example.test",
  }),
  membership: async () => null,
  bootstrap: async () => workspaceId,
  listWorkspaces: async () => [],
});

describe("T09 handoff API boundary", () => {
  it("rejects a malicious origin before any user or packet read", async () => {
    const result = response();
    await handler(request("https://evil.example"), result.res);
    expect(result.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
  it("allows only handoff operations from the exact extension origin", async () => {
    const wrongOperation = response();
    await handler(request(extensionOrigin, "item.detail"), wrongOperation.res);
    expect(wrongOperation.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    const wrongAccount = response();
    await handler(request(extensionOrigin), wrongAccount.res);
    expect(wrongAccount.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});
