import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getClaims: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { auth } }));
import handler from "../../../api/chatgpt/mcp";

beforeEach(() => {
  vi.stubEnv("CHATGPT_PLUGIN_ENABLED", "true");
  vi.stubEnv("CHATGPT_PRIVATE_USER_IDS", "seller-a");
  vi.stubEnv("CHATGPT_OAUTH_CLIENT_ID", "client-a");
  vi.stubEnv("VERCEL_APP_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  vi.stubEnv("ADMIN_SECRET", "test-secret");
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("reports only the unknown attachment hostname, without fetching it or logging file secrets", async () => {
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
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    "chatgpt_attachment_host_unrecognized",
    "oaisdmntprtestregion.blob.core.windows.net",
  );
});
