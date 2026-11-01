import { describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    data: { user: { id: "seller-a" } },
    error: null,
  })),
}));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { auth } }));
import { getDirectUser } from "../../../utils/directUser";
import { isOAuthToken, validatePluginClaims } from "../../../utils/chatgptAuth";

const issuer = "https://example.supabase.co/auth/v1";
const config = { issuer, clientId: "private-client", users: ["seller-a"] };
const claims = {
  iss: issuer,
  aud: "authenticated",
  sub: "seller-a",
  client_id: "private-client",
  role: "autolister_plugin",
  exp: 2000,
};

describe("private plugin authentication boundary", () => {
  it("ordinary API authentication refuses OAuth before consulting Supabase", async () => {
    auth.getUser.mockClear();
    const token =
      "header." +
      Buffer.from(JSON.stringify(claims)).toString("base64url") +
      ".signature";
    expect((await getDirectUser(token)).data.user).toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
    expect((await getDirectUser("ordinary-token")).data.user?.id).toBe(
      "seller-a",
    );
    expect(auth.getUser).toHaveBeenCalledWith("ordinary-token");
  });
  it("accepts only verified claims for the configured client and tester", () => {
    expect(validatePluginClaims(claims, config, 1000)).toBe("seller-a");
  });
  it.each([
    { client_id: "another-client" },
    { sub: "seller-b" },
    { iss: "https://evil.example" },
    { aud: "other" },
    { exp: 999 },
    { role: "authenticated" },
    { client_id: undefined },
  ])("rejects a token outside the plugin boundary: %j", (change) => {
    expect(() =>
      validatePluginClaims({ ...claims, ...change }, config, 1000),
    ).toThrow();
  });
  it("fails closed when the private tester list is empty", () => {
    expect(() =>
      validatePluginClaims(claims, { ...config, users: [] }, 1000),
    ).toThrow();
  });
  it("identifies OAuth tokens for denial by ordinary product APIs", () => {
    const token =
      "header." +
      Buffer.from(JSON.stringify(claims)).toString("base64url") +
      ".signature";
    expect(isOAuthToken(token)).toBe(true);
    expect(
      isOAuthToken(
        "header." +
          Buffer.from('{"sub":"seller-a"}').toString("base64url") +
          ".signature",
      ),
    ).toBe(false);
    expect(isOAuthToken("malformed")).toBe(false);
  });
});
