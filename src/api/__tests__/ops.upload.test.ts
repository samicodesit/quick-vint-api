import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createUploadHandler } from "../../../api/ops-upload";
import { OpsError } from "../../../utils/ops/core/errors";

const grant = "g".repeat(43);
const uploadId = "c0000000-0000-4000-8000-000000000201";
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
      origin,
      host: "autolister.app",
      "content-type": "application/json",
    },
    body,
  } as unknown as VercelRequest;
}
const handler = createUploadHandler({
  redeemPairing: async () => ({
    workspaceId: "w",
    sessionId: "s",
    itemId: "i",
    scope: "upload",
    grant,
  }),
  pairedManifest: async () => ({ uploads: [{ uploadId }] }),
  pairingScope: async (_grant, id) => {
    if (id !== uploadId)
      throw new OpsError("FORBIDDEN", "Upload belongs to another capture");
    return { workspaceId: "w", sessionId: "s" };
  },
  signUpload: async () => ({
    uploadId,
    state: "pending",
    path: "w/i/u",
    signature: "signature",
    tusEndpoint: "https://storage.example.test",
  }),
  completeUpload: async () => ({ uploadId, state: "available" }),
});

describe("T05 phone upload boundary", () => {
  it("exposes only upload actions and rejects a foreign origin", async () => {
    const invalid = response();
    await handler(request({ action: "workspace.admin", grant }), invalid.res);
    expect(invalid.state.status).toBe(400);
    const foreign = response();
    await handler(
      request({ action: "redeem", token: grant }, "https://other.example"),
      foreign.res,
    );
    expect(foreign.state.status).toBe(403);
  });
  it("requires the grant's capture scope for signing and completion", async () => {
    const wrong = response();
    await handler(
      request({
        action: "complete",
        grant,
        input: {
          uploadId: "c0000000-0000-4000-8000-000000000202",
          checksum: "a".repeat(64),
        },
      }),
      wrong.res,
    );
    expect(wrong.state.body).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    const correct = response();
    await handler(
      request({
        action: "complete",
        grant,
        input: { uploadId, checksum: "a".repeat(64) },
      }),
      correct.res,
    );
    expect(correct.state.body).toMatchObject({
      ok: true,
      data: { uploadId, state: "available" },
    });
  });
});
