import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createWorkerHandler } from "../../../api/ops-worker";

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

describe("T02 worker endpoint", () => {
  it("denies callers without the configured secret", async () => {
    let runs = 0;
    const handler = createWorkerHandler("correct-secret", async () => {
      runs++;
      return { claimed: 0, completed: 0, failed: 0 };
    });
    const result = response();
    await handler(
      {
        method: "POST",
        headers: { "x-ops-worker-token": "wrong" },
      } as unknown as VercelRequest,
      result.res,
    );
    expect(result.state.status).toBe(401);
    expect(runs).toBe(0);
  });

  it("returns only bounded queue counts on a valid invocation", async () => {
    const handler = createWorkerHandler("correct-secret", async () => ({
      claimed: 1,
      completed: 1,
      failed: 0,
    }));
    const result = response();
    await handler(
      {
        method: "POST",
        headers: { "x-ops-worker-token": "correct-secret" },
      } as unknown as VercelRequest,
      result.res,
    );
    expect(result.state.body).toEqual({ claimed: 1, completed: 1, failed: 0 });
  });
});
