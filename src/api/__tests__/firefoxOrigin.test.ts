import { describe, expect, it } from "vitest";
import { isFirefoxExtensionOrigin } from "../../../utils/allowedOrigins";

describe("Firefox API origin", () => {
  it("accepts the per-install UUID extension origin", () => {
    expect(
      isFirefoxExtensionOrigin(
        "moz-extension://d5013c18-2f77-438f-914c-1e6325ce8d70",
      ),
    ).toBe(true);
  });
  it.each([
    undefined,
    "null",
    "https://evil.example",
    "https://moz-extension.example",
    "moz-extension://evil",
    "moz-extension://d5013c18-2f77-438f-914c-1e6325ce8d70.evil.example",
    "moz-extension://d5013c18-2f77-438f-914c-1e6325ce8d70/",
    "moz-extension://d5013c18-2f77-438f-914c-1e6325ce8d70:80",
  ])("rejects non-origin or forged value %s", (origin) => {
    expect(isFirefoxExtensionOrigin(origin)).toBe(false);
  });
});
