import { describe, expect, it } from "vitest";
import { shouldStoreDebugGenerationImages } from "../../../utils/debugGenerationImages.js";

describe("generate debug image storage", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(shouldStoreDebugGenerationImages()).toBe(false);
    expect(shouldStoreDebugGenerationImages("false")).toBe(false);
    expect(shouldStoreDebugGenerationImages("true")).toBe(true);
  });
});
