import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createOpsHandler } from "../../../api/ops";
import type { InventoryServices } from "../../../utils/ops/inventory/intake";

const workspaceId = "c0000000-0000-4000-8000-000000000001";
const userId = "a0000000-0000-4000-8000-000000000001";

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

function request(body: unknown, token?: string) {
  return {
    method: "POST",
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
      origin: "https://autolister.app",
      host: "autolister.app",
      "content-type": "application/json",
    },
    body,
  } as unknown as VercelRequest;
}

describe("T01 ops gateway", () => {
  it("rejects unauthenticated and unknown operations", async () => {
    const handler = createOpsHandler({
      authenticate: async () => null,
      membership: async () => null,
      bootstrap: async () => workspaceId,
      listWorkspaces: async () => [],
    });
    const first = response();
    await handler(
      request({
        kind: "query",
        name: "session.read",
        workspaceId,
        payload: {},
      }),
      first.res,
    );
    expect(first.state.status).toBe(401);
    expect(first.state.body).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    const second = response();
    await handler(
      request(
        { kind: "query", name: "eval", workspaceId, payload: {} },
        "token",
      ),
      second.res,
    );
    expect(second.state.status).toBe(400);
  });

  it("checks current membership and omits restricted finance fields", async () => {
    const handler = createOpsHandler({
      authenticate: async () => ({ userId, email: "worker@example.com" }),
      membership: async () => "warehouse" as const,
      bootstrap: async () => workspaceId,
      listWorkspaces: async () => [],
    });
    const result = response();
    await handler(
      request(
        {
          kind: "query",
          name: "session.read",
          workspaceId,
          payload: {},
          role: "owner",
          costMinor: 999,
        },
        "token",
      ),
      result.res,
    );
    expect(result.state.status).toBe(200);
    expect(result.state.body).toMatchObject({
      ok: true,
      data: { workspaceId, role: "warehouse" },
    });
    expect(JSON.stringify(result.state.body)).not.toContain("costMinor");
    expect(JSON.stringify(result.state.body)).not.toContain("999");
  });

  it("denies revoked membership on a fresh request", async () => {
    const handler = createOpsHandler({
      authenticate: async () => ({ userId, email: "worker@example.com" }),
      membership: async () => null,
      bootstrap: async () => workspaceId,
      listWorkspaces: async () => [],
    });
    const result = response();
    await handler(
      request(
        { kind: "query", name: "session.read", workspaceId, payload: {} },
        "token",
      ),
      result.res,
    );
    expect(result.state.status).toBe(403);
  });

  it("requires command metadata and reports a changed bootstrap payload conflict", async () => {
    const handler = createOpsHandler({
      authenticate: async () => ({ userId, email: "owner@example.com" }),
      membership: async () => null,
      bootstrap: async () => {
        throw Object.assign(new Error("conflict"), { opsCode: "CONFLICT" });
      },
      listWorkspaces: async () => [],
    });
    const missing = response();
    await handler(
      request(
        {
          kind: "command",
          name: "workspace.bootstrap",
          workspaceId: "00000000-0000-0000-0000-000000000000",
          payload: { name: "Seller" },
        },
        "token",
      ),
      missing.res,
    );
    expect(missing.state.status).toBe(400);
    const conflict = response();
    await handler(
      request(
        {
          kind: "command",
          name: "workspace.bootstrap",
          workspaceId: "00000000-0000-0000-0000-000000000000",
          payload: { name: "Seller" },
          meta: {
            idempotencyKey: "c0000000-0000-4000-8000-000000000010",
            expectedVersion: null,
          },
        },
        "token",
      ),
      conflict.res,
    );
    expect(conflict.state.status).toBe(409);
  });

  it("lists only the authenticated user's active workspaces", async () => {
    const handler = createOpsHandler({
      authenticate: async () => ({ userId, email: "owner@example.com" }),
      membership: async () => null,
      bootstrap: async () => workspaceId,
      listWorkspaces: async (requestedUserId) => {
        expect(requestedUserId).toBe(userId);
        return [{ workspaceId, role: "owner", name: "Seller" }];
      },
    });
    const result = response();
    await handler(
      request(
        {
          kind: "query",
          name: "workspace.list",
          workspaceId: "00000000-0000-0000-0000-000000000000",
          payload: {},
        },
        "token",
      ),
      result.res,
    );
    expect(result.state.body).toMatchObject({
      ok: true,
      data: [{ workspaceId, role: "owner", name: "Seller" }],
    });
  });

  it("rejects malformed and cross-origin requests without throwing", async () => {
    const handler = createOpsHandler({
      authenticate: async () => ({ userId, email: null }),
      membership: async () => "owner",
      bootstrap: async () => workspaceId,
      listWorkspaces: async () => [],
    });
    for (const origin of ["not-a-url", "https://other.example"]) {
      const req = request(
        { kind: "query", name: "session.read", workspaceId, payload: {} },
        "token",
      );
      req.headers.origin = origin;
      const result = response();
      await handler(req, result.res);
      expect(result.state.status).toBe(403);
    }
  });
});

describe("T03 intake gateway", () => {
  it("passes server-derived actor and stable command metadata to intake", async () => {
    let received: { workspaceId: string; userId: string; key: string } | null =
      null;
    const inventory = {
      createItem: async (
        actor: { workspaceId: string; userId: string },
        _input: unknown,
        meta: { idempotencyKey: string },
      ) => {
        received = {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          key: meta.idempotencyKey,
        };
        return {
          itemId: "c0000000-0000-4000-8000-000000000099",
          displaySku: "AL-000001",
          version: 1,
        };
      },
    } as unknown as InventoryServices;
    const handler = createOpsHandler(
      {
        authenticate: async () => ({ userId, email: null }),
        membership: async () => "lister",
        bootstrap: async () => workspaceId,
        listWorkspaces: async () => [],
      },
      inventory,
    );
    const result = response();
    await handler(
      request(
        {
          kind: "command",
          name: "item.create",
          workspaceId,
          payload: {},
          meta: {
            idempotencyKey: "c0000000-0000-4000-8000-000000000098",
            expectedVersion: null,
          },
          role: "owner",
        },
        "token",
      ),
      result.res,
    );
    expect(result.state.status).toBe(200);
    expect(received).toEqual({
      workspaceId,
      userId,
      key: "c0000000-0000-4000-8000-000000000098",
    });
  });

  it("rejects invalid item input and prevents a warehouse role from intake", async () => {
    const handler = createOpsHandler({
      authenticate: async () => ({ userId, email: null }),
      membership: async () => "warehouse",
      bootstrap: async () => workspaceId,
      listWorkspaces: async () => [],
    });
    const invalid = response();
    await handler(
      request(
        {
          kind: "command",
          name: "item.create",
          workspaceId,
          payload: { existingSku: "" },
          meta: {
            idempotencyKey: "c0000000-0000-4000-8000-000000000097",
            expectedVersion: null,
          },
        },
        "token",
      ),
      invalid.res,
    );
    expect(invalid.state.status).toBe(400);
    const forbidden = response();
    await handler(
      request(
        {
          kind: "command",
          name: "item.create",
          workspaceId,
          payload: {},
          meta: {
            idempotencyKey: "c0000000-0000-4000-8000-000000000097",
            expectedVersion: null,
          },
        },
        "token",
      ),
      forbidden.res,
    );
    expect(forbidden.state.status).toBe(403);
  });
});
