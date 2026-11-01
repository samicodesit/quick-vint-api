import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getClaims: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { auth } }));
import handler from "../../../api/chatgpt/mcp";
function response() {
  return {
    setHeader: vi.fn(),
    status: vi.fn(function (this: any, code: number) {
      this.code = code;
      return this;
    }),
    json: vi.fn(),
    end: vi.fn(),
    send: vi.fn(),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CHATGPT_PLUGIN_ENABLED;
});
it("fails closed before activation", async () => {
  const res = response();
  await handler({ method: "POST", headers: {}, body: {} } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(auth.getClaims).not.toHaveBeenCalled();
});
it("never trusts forwarded Sites identity headers", async () => {
  process.env.CHATGPT_PLUGIN_ENABLED = "true";
  const res = response();
  await handler(
    {
      method: "POST",
      headers: { "oai-authenticated-user-id": "victim" },
      body: { method: "tools/call" },
    } as any,
    res as any,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(auth.getClaims).not.toHaveBeenCalled();
});
it("rejects invalid signed tokens before touching transfers", async () => {
  process.env.CHATGPT_PLUGIN_ENABLED = "true";
  auth.getClaims.mockResolvedValue({ data: null, error: new Error("invalid") });
  const res = response();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer fake" },
      body: {},
    } as any,
    res as any,
  );
  expect(res.status).toHaveBeenCalledWith(401);
});
