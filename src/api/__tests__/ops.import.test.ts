import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createImportUploadHandler } from "../../../api/ops-import";

const workspaceId = "c0000000-0000-4000-8000-000000000401";
const userId = "a0000000-0000-4000-8000-000000000401";
const csv = "SKU,Title\nA,Coat\n";
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
function request(body: unknown, origin = "https://autolister.app") {
  return {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      origin,
      host: "autolister.app",
      "content-type": "application/json",
      "x-ops-workspace-id": workspaceId,
    },
    body,
  } as unknown as VercelRequest;
}
const handler = createImportUploadHandler(
  {
    authenticate: async () => ({ userId, email: "fixture@example.test" }),
    membership: async (_user, _workspace) => "owner",
    bootstrap: async () => workspaceId,
    listWorkspaces: async () => [],
  },
  async (_actor, _name, text) => ({
    fileId: workspaceId,
    rowCount: text.split("\n").length - 2,
    headers: ["SKU", "Title"],
    replay: false,
  }),
);

describe("T06 CSV upload boundary", () => {
  it("rejects a foreign origin and invalid body before staging", async () => {
    const foreign = response();
    await handler(
      request({ name: "stock.csv", csv }, "https://foreign.example"),
      foreign.res,
    );
    expect(foreign.state.status).toBe(403);
    const invalid = response();
    await handler(request({ name: "stock.csv", csv: "" }), invalid.res);
    expect(invalid.state.status).toBe(400);
  });
  it("stages a manager-scoped CSV with current membership", async () => {
    const result = response();
    await handler(request({ name: "stock.csv", csv }), result.res);
    expect(result.state.body).toMatchObject({
      ok: true,
      data: { rowCount: 1, headers: ["SKU", "Title"] },
    });
  });
  it("denies warehouse staff before the service staging path", async () => {
    const denied = createImportUploadHandler(
      {
        authenticate: async () => ({ userId, email: "fixture@example.test" }),
        membership: async () => "warehouse",
        bootstrap: async () => workspaceId,
        listWorkspaces: async () => [],
      },
      async () => {
        throw new Error("stage must not run");
      },
    );
    const result = response();
    await denied(request({ name: "stock.csv", csv }), result.res);
    expect(result.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});
