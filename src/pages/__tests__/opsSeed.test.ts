import { describe, expect, it } from "vitest";

describe("OS seed safety", () => {
  it("test_seed_refuses_production", async () => {
    const { assertLocalSeedTarget } =
      await import("../../../scripts/ops-seed.mjs");
    expect(() =>
      assertLocalSeedTarget("https://project.supabase.co", "test"),
    ).toThrow(/local database/i);
    expect(() =>
      assertLocalSeedTarget("http://127.0.0.1:54321", "production"),
    ).toThrow(/local or test/i);
    expect(() =>
      assertLocalSeedTarget("http://127.0.0.1:54321", "test"),
    ).not.toThrow();
  });
});
