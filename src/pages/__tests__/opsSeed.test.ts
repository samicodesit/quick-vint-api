import { describe, expect, it } from "vitest";

describe("OS seed safety", () => {
  it("test_seed_refuses_production", async () => {
    const { assertLocalSeedTarget } =
      await import("../../../scripts/ops-seed.mjs");
    expect(() =>
      assertLocalSeedTarget("https://project.supabase.co", "test"),
    ).toThrow(/local database/i);
    expect(() =>
      assertLocalSeedTarget(
        "postgresql://postgres@127.0.0.1:54321/ops_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "production",
      ),
    ).toThrow(/local or test/i);
    expect(() =>
      assertLocalSeedTarget(
        "postgresql://postgres@127.0.0.1:54321/ops_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "test",
      ),
    ).not.toThrow();
  });
});
