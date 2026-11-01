import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
vi.mock("../../../utils/chatgptPhotoFetch", () => ({
  fetchChatGPTPhoto: (url: string, init: RequestInit) => fetch(url, init),
}));
const auth = vi.hoisted(() => ({ getClaims: vi.fn(), getUser: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { auth } }));
import handler from "../../../api/chatgpt/mcp";
import handoff from "../../../api/chatgpt/handoff";

beforeEach(() => {
  vi.stubEnv("CHATGPT_PLUGIN_ENABLED", "true");
  vi.stubEnv("CHATGPT_PRIVATE_USER_IDS", "seller-a");
  vi.stubEnv("CHATGPT_OAUTH_CLIENT_ID", "client-a");
  vi.stubEnv("VERCEL_APP_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  vi.stubEnv("ADMIN_SECRET", "test-secret");
  auth.getUser.mockResolvedValue({
    data: { user: { id: "seller-a" } },
    error: null,
  });
  auth.getClaims.mockResolvedValue({
    data: {
      claims: {
        sub: "seller-a",
        iss: "https://example.supabase.co/auth/v1",
        aud: "authenticated",
        role: "autolister_plugin",
        client_id: "client-a",
        exp: Math.floor(Date.now() / 1000) + 300,
        autolister_resource: "https://autolister.app/api/chatgpt/mcp",
      },
    },
    error: null,
  });
});

function mockResponse() {
  const chunks: Buffer[] = [];
  return Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }),
    {
      chunks,
      flushHeaders: vi.fn(),
      code: 200,
      setHeader: vi.fn(),
      status: vi.fn(function (this: any, code: number) {
        this.code = code;
        return this;
      }),
      send: vi.fn(),
      json: vi.fn(),
    },
  );
}
async function prepare(url: string) {
  const res = mockResponse();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer test" },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "prepare_item",
          arguments: {
            title: "Jeans",
            description: "Blue jeans",
            photos: [{ file_id: "test-photo", download_url: url }],
          },
        },
      },
    } as any,
    res as any,
  );
  return JSON.parse(res.send.mock.calls[0][0].toString()).result;
}
async function open(body: unknown) {
  const res = mockResponse();
  await handoff(
    {
      method: "POST",
      headers: {
        authorization: "Bearer ordinary-session",
        origin: "https://autolister.app",
      },
      body,
    } as any,
    res as any,
  );
  return res;
}
function transferHarness(upstream: () => Response) {
  let sealed = "";
  const operations: any[] = [];
  const downloads = vi.fn(async (_url: string, _init: RequestInit) =>
    upstream(),
  );
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (
      url !==
      "https://example.supabase.co/rest/v1/rpc/autolister_hosted_handoff"
    )
      return downloads(url, init);
    const op = JSON.parse(init.body as string);
    operations.push(op);
    if (op.op === "put") sealed = op.payload;
    return Response.json({
      token: sealed,
      budget: 8 * 1024 * 1024,
      reservation: "test-reservation",
    });
  });
  return { downloads, operations };
}
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0]);
it.each([
  "oaisdmntprnortheu.blob.core.windows.net",
  "oaisdmntprsoutheastus3.blob.core.windows.net",
  "oaisdmntprdenmarkeast.blob.core.windows.net",
  "oaisdmntprukwest.blob.core.windows.net",
  "oaisdmntprnewregion.blob.core.windows.net",
])("transfers the photo automatically from %s", async (host) => {
  const { downloads, operations } = transferHarness(() => new Response(jpeg));
  const result = await prepare(`https://${host}/photo?sig=private`);
  expect(result.isError).not.toBe(true);
  const id = result.content[0].text.match(/item=([a-f0-9-]+)/)[1];
  const metadata = await open({ id });
  expect(JSON.parse(metadata.send.mock.calls[0][0].toString()).reselect).toBe(
    false,
  );
  const photo = await open({ id, index: 0 });
  expect(photo.code).toBe(200);
  expect(Buffer.concat(photo.chunks)).toEqual(Buffer.from(jpeg));
  expect(downloads).toHaveBeenCalledExactlyOnceWith(
    `https://${host}/photo?sig=private`,
    expect.objectContaining({ redirect: "manual", credentials: "omit" }),
  );
  expect(operations.at(-1)).toMatchObject({
    op: "settle",
    amount: jpeg.length,
  });
});
it.each([
  "http://oaisdmntprnortheu.blob.core.windows.net/a",
  "https://attacker.blob.core.windows.net/a",
  "https://oaisdmntprnortheu.blob.core.windows.net.evil.example/a",
  "https://127.0.0.1/a",
  "https://oaisdmntprnortheu.blob.core.windows.net:444/a",
  "https://user:password@oaisdmntprnortheu.blob.core.windows.net/a",
])("rejects untrusted photo URL %s before ledger or fetch", async (url) => {
  const { downloads, operations } = transferHarness(() => new Response(jpeg));
  expect((await prepare(url)).isError).toBe(true);
  expect(downloads).not.toHaveBeenCalled();
  expect(operations).toHaveLength(0);
});
it.each(["redirect", "oversized", "not-image"])(
  "does not bypass transfer limits for %s",
  async (kind) => {
    const { downloads, operations } = transferHarness(() =>
      kind === "redirect"
        ? new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/private" },
          })
        : kind === "oversized"
          ? new Response(jpeg, {
              headers: { "content-length": String(9 * 1024 * 1024) },
            })
          : new Response("not an image"),
    );
    const result = await prepare(
      "https://oaisdmntprnortheu.blob.core.windows.net/photo",
    );
    const id = result.content[0].text.match(/item=([a-f0-9-]+)/)[1];
    const res = await open({ id, index: 0 });
    expect(res.code).toBeGreaterThanOrEqual(400);
    expect(downloads).toHaveBeenCalledTimes(1);
    expect(operations.some((o) => o.op === "settle")).toBe(false);
  },
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("prepares a regional attachment without fetching it or logging file secrets", async () => {
  const fetcher = vi.fn(async (_url: string) => Response.json({}));
  vi.stubGlobal("fetch", fetcher);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(function (this: any) {
      return this;
    }),
    send: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer test" },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "prepare_item",
          arguments: {
            title: "Jeans",
            description: "Blue jeans",
            photos: [
              {
                file_id: "private-file-id",
                download_url:
                  "https://oaisdmntprtestregion.blob.core.windows.net/private-path?sig=secret",
              },
            ],
          },
        },
      },
    } as any,
    res,
  );
  expect(
    JSON.parse(res.send.mock.calls[0][0].toString()).result.isError,
  ).not.toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://example.supabase.co/rest/v1/rpc/autolister_hosted_handoff",
  );
  expect(warn).not.toHaveBeenCalled();
});

it("streams a validated 6 MiB photo and settles the actual bytes", async () => {
  const bytes = new Uint8Array(6 * 1024 * 1024);
  bytes.set(jpeg);
  const { operations } = transferHarness(() => new Response(bytes));
  const result = await prepare(
    "https://oaisdmntprnewregion.blob.core.windows.net/photo",
  );
  const id = result.content[0].text.match(/item=([a-f0-9-]+)/)[1];
  const photo = await open({ id, index: 0 });
  expect(photo.code).toBe(200);
  expect(photo.send).not.toHaveBeenCalled();
  expect(Buffer.concat(photo.chunks).equals(Buffer.from(bytes))).toBe(true);
  expect(photo.chunks.length).toBeGreaterThan(1);
  expect(operations.at(-1)).toMatchObject({
    op: "settle",
    amount: bytes.length,
  });
});

it("handles a client disconnect without writing a second JSON response", async () => {
  const bytes = new Uint8Array(6 * 1024 * 1024);
  bytes.set(jpeg);
  transferHarness(() => new Response(bytes));
  const result = await prepare("https://files.openai.com/photo");
  const id = result.content[0].text.match(/item=([a-f0-9-]+)/)[1];
  const res = mockResponse();
  res._write = (_chunk, _encoding, done) =>
    done(new Error("Client disconnected"));
  await handoff(
    {
      method: "POST",
      headers: {
        authorization: "Bearer ordinary-session",
        origin: "https://autolister.app",
      },
      body: { id, index: 0 },
    } as any,
    res as any,
  );
  expect(res.destroyed).toBe(true);
  expect(res.json).not.toHaveBeenCalled();
  expect(res.send).not.toHaveBeenCalled();
});
