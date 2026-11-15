import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  admin: { oauth: { getClient: vi.fn() } },
}));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { auth } }));
import connection from "../../../api/chatgpt/connection";
import mcp from "../../../api/chatgpt/mcp";
import handoff from "../../../api/chatgpt/handoff";

const resource = "https://autolister.app/api/chatgpt/mcp";
const claims = () => ({
  sub: "ordinary-seller",
  iss: "https://example.supabase.co/auth/v1",
  aud: "authenticated",
  role: "autolister_plugin",
  client_id: "approved-client",
  exp: Math.floor(Date.now() / 1000) + 300,
  autolister_resource: resource,
});
function response() {
  return {
    code: 200,
    body: undefined as any,
    setHeader: vi.fn(),
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send(body: Buffer) {
      this.body = JSON.parse(body.toString());
      return this;
    },
    end() {
      return this;
    },
  };
}
async function request(
  handler: typeof mcp,
  body: unknown = {},
  token = "session",
  origin = "https://autolister.app",
) {
  const res = response();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer " + token, origin },
      body,
    } as any,
    res as any,
  );
  return res;
}
beforeEach(() => {
  vi.stubEnv("CHATGPT_PLUGIN_ENABLED", "true");
  vi.stubEnv("CHATGPT_PLUGIN_ACCESS", "public");
  vi.stubEnv("CHATGPT_PRIVATE_USER_IDS", "private-tester");
  vi.stubEnv("CHATGPT_OAUTH_CLIENT_ID", "approved-client");
  vi.stubEnv("VERCEL_APP_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  vi.stubEnv("ADMIN_SECRET", "test-secret");
  auth.getUser.mockResolvedValue({
    data: { user: { id: "ordinary-seller" } },
    error: null,
  });
  auth.getClaims.mockResolvedValue({ data: { claims: claims() }, error: null });
  auth.admin.oauth.getClient.mockResolvedValue({
    data: { redirect_uris: ["https://chatgpt.com/connector/oauth/approved"] },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("lets an ordinary seller connect only in explicit public mode", async () => {
  const res = await request(connection);
  expect(res.code).toBe(200);
  expect(res.body).toEqual({
    clientId: "approved-client",
    redirectUris: ["https://chatgpt.com/connector/oauth/approved"],
  });
});
it.each(["", "private", "PUBLIC", "true", "publci"])(
  "keeps connection and MCP private for access setting %j",
  async (value) => {
    vi.stubEnv("CHATGPT_PLUGIN_ACCESS", value);
    expect((await request(connection)).code).toBe(403);
    expect(
      (await request(mcp, { jsonrpc: "2.0", id: 1, method: "tools/list" }))
        .code,
    ).toBe(401);
    auth.getUser.mockResolvedValue({
      data: { user: { id: "private-tester" } },
      error: null,
    });
    expect((await request(connection)).code).toBe(200);
  },
);
it("discovers the approved tool for a non-tester with verified delegated claims", async () => {
  vi.stubEnv("CHATGPT_PRIVATE_USER_IDS", "");
  const res = await request(mcp, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });
  expect(res.code).toBe(200);
  expect(res.body.result.tools.map((t: any) => t.name)).toEqual([
    "prepare_item",
  ]);
});
it.each([
  { sub: "" },
  { sub: undefined },
  { client_id: "wrong-client" },
  { role: "authenticated" },
  { iss: "https://evil.example/auth/v1" },
  { aud: "other" },
  { exp: 0 },
  { autolister_resource: "https://evil.example" },
])("still rejects invalid public-mode claims: %j", async (change) => {
  auth.getClaims.mockResolvedValue({
    data: { claims: { ...claims(), ...change } },
    error: null,
  });
  expect(
    (await request(mcp, { jsonrpc: "2.0", id: 1, method: "tools/list" })).code,
  ).toBe(401);
});
it("keeps the activation switch and origin restrictions in public mode", async () => {
  expect(
    (await request(connection, {}, "session", "https://evil.example")).code,
  ).toBe(403);
  expect(
    (await request(handoff, {}, "session", "https://evil.example")).code,
  ).toBe(403);
  vi.stubEnv("CHATGPT_PLUGIN_ENABLED", "false");
  expect((await request(connection)).code).toBe(404);
  expect((await request(mcp)).code).toBe(404);
  expect((await request(handoff)).code).toBe(404);
});
it("does not admit unauthenticated accounts or delegated tokens to connection and handoff", async () => {
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await request(connection)).code).toBe(403);
  expect((await request(handoff)).code).toBe(401);
  const delegated =
    "header." +
    Buffer.from(JSON.stringify(claims())).toString("base64url") +
    ".sig";
  expect((await request(connection, {}, delegated)).code).toBe(403);
  expect((await request(handoff, {}, delegated)).code).toBe(401);
});
it("keeps public handoffs encrypted to their originating seller", async () => {
  let sealed = "";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const op = JSON.parse(init.body as string);
    if (op.op === "put") sealed = op.payload;
    return Response.json({ token: sealed });
  });
  const prepared = await request(mcp, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "prepare_item",
      arguments: {
        title: "Blue jeans",
        description: "Straight-leg denim",
        photos: [
          { file_id: "sample", download_url: "https://files.openai.com/photo" },
        ],
      },
    },
  });
  expect(prepared.code).toBe(200);
  expect(prepared.body.result.isError).not.toBe(true);
  const id = prepared.body.result.content[0].text.match(/item=([a-f0-9-]+)/)[1];
  const own = await request(handoff, { id });
  expect(own.code).toBe(200);
  expect(own.body.title).toBe("Blue jeans");
  auth.getUser.mockResolvedValue({
    data: { user: { id: "different-seller" } },
    error: null,
  });
  const other = await request(handoff, { id });
  expect(other.code).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(other.body)).not.toContain("Straight-leg denim");
});
