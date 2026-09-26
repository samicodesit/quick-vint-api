import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, describe, expect, it } from "vitest";
import { createOpsHandler } from "../../../api/ops";

const workspaceId = "c0000000-0000-4000-8000-000000000411";
const userId = "a0000000-0000-4000-8000-000000000411";
const itemId = "b0000000-0000-4000-8000-000000000411";
const priorEnv = { ai: process.env.OPS_AI_ENABLED, ops: process.env.OPS_ENV };
afterEach(() => {
  if (priorEnv.ai === undefined) delete process.env.OPS_AI_ENABLED;
  else process.env.OPS_AI_ENABLED = priorEnv.ai;
  if (priorEnv.ops === undefined) delete process.env.OPS_ENV;
  else process.env.OPS_ENV = priorEnv.ops;
});

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
function request() {
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
      name: "analysis.request",
      workspaceId,
      payload: { itemId, captureRevision: 2, mode: "initial" },
      meta: {
        idempotencyKey: "d0000000-0000-4000-8000-000000000411",
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

describe("T07 analysis API gate", () => {
  it("returns a usable manual path when runtime AI is disabled", async () => {
    delete process.env.OPS_AI_ENABLED;
    process.env.OPS_ENV = "production";
    const result = response();
    await handler("owner")(request(), result.res);
    expect(result.state.body).toMatchObject({
      ok: true,
      data: { status: "manual" },
    });
  });
  it("rejects a warehouse worker before any AI request", async () => {
    const result = response();
    await handler("warehouse")(request(), result.res);
    expect(result.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});
