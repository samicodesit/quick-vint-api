import { expect, it } from "vitest";
import { safeChatGPTReturn } from "../chatgptReturn";
it("preserves only the two supported same-origin connection paths", () => {
  expect(safeChatGPTReturn("/oauth/consent?authorization_id=abc")).toBe(
    "/oauth/consent?authorization_id=abc",
  );
  expect(safeChatGPTReturn("/app/chatgpt?item=abc")).toBe(
    "/app/chatgpt?item=abc",
  );
  for (const value of [
    null,
    "//evil.example/oauth/consent",
    "https://evil.example/app/chatgpt",
    "/admin",
    "/oauth/consent#token",
    "javascript:alert(1)",
  ])
    expect(safeChatGPTReturn(value)).toBeNull();
});
