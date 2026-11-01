import { expect, it } from "vitest";
import { safeOAuthRedirect } from "../oauthRedirect";
const allowed = ["https://chatgpt.com/connector/oauth/private-test"];
it("accepts the registered callback with the provider authorization response", () => {
  const url = allowed[0] + "?code=one-time&state=expected";
  expect(safeOAuthRedirect(url, allowed)).toBe(url);
});
it.each([
  "https://evil.example/connector/oauth/private-test?code=x",
  "https://chatgpt.com/connector/oauth/another?code=x",
  "http://chatgpt.com/connector/oauth/private-test?code=x",
  "https://user:pass@chatgpt.com/connector/oauth/private-test?code=x",
  "https://chatgpt.com/connector/oauth/private-test#access_token=x",
  "javascript:alert(1)",
])("rejects an unexpected callback %s", (url) => {
  expect(safeOAuthRedirect(url, allowed)).toBeNull();
});
