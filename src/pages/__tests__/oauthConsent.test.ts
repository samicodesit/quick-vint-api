import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ScriptTarget } from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync("src/pages/oauth/consent.astro", "utf8")
  .split("<script>")[1]
  .split("</script>")[0]
  .replace(/^import .*;$/gm, "");
const script = transpileModule(source, {
  compilerOptions: { target: ScriptTarget.ES2022 },
}).outputText;

async function consent(scope: string, allowed = true, clientId = "expected") {
  const elements = Object.fromEntries(
    ["status", "signin", "permissions", "approve", "deny"].map((id) => [
      "#" + id,
      { textContent: "", hidden: true },
    ]),
  );
  const approveAuthorization = vi.fn();
  await runInNewContext(`(async () => {${script}})()`, {
    document: { querySelector: (id: string) => elements[id] },
    location: { href: "https://autolister.app/oauth/consent?authorization_id=test" },
    URL,
    getBrowserSession: async () => ({
      access_token: "test",
      user: { id: "seller" },
    }),
    fetch: async () => ({
      ok: allowed,
      json: async () => ({ clientId: "expected", redirectUris: [] }),
    }),
    createBrowserSupabaseClient: () => ({
      auth: {
        oauth: {
          getAuthorizationDetails: async () => ({
            data: {
              client: { id: clientId },
              user: { id: "seller", email: "seller@example.com" },
              scope,
            },
          }),
          approveAuthorization,
        },
      },
    }),
  });
  expect(approveAuthorization).not.toHaveBeenCalled();
  return elements;
}

it.each(["openid email", "openid email offline_access"])(
  "offers explicit consent for the real portal scope %s",
  async (scope) => {
    const elements = await consent(scope);
    expect(elements["#permissions"].hidden).toBe(false);
    expect(elements["#status"].textContent).toBe("seller@example.com");
  },
);

it.each(["profile", "phone", "storage", "admin"])(
  "rejects extra data permissions: %s",
  async (extra) => {
    const elements = await consent("openid email offline_access " + extra);
    expect(elements["#permissions"].hidden).toBe(true);
    expect(elements["#status"].textContent).toBe(
      "This connection requests unsupported permissions.",
    );
  },
);

it("keeps ordinary accounts outside the private test", async () => {
  const elements = await consent("openid email offline_access", false);
  expect(elements["#permissions"].hidden).toBe(true);
  expect(elements["#status"].textContent).toBe(
    "This private test is not enabled for your account.",
  );
});

it("rejects a different OAuth client", async () => {
  const elements = await consent("openid email offline_access", true, "other");
  expect(elements["#permissions"].hidden).toBe(true);
  expect(elements["#status"].textContent).toBe(
    "Open a fresh connection from ChatGPT to continue.",
  );
});
