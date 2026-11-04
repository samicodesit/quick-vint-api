import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { OPENAI_DRAFT_PILOT_PERCENT: "0" },
    environment: "node",
    // Each PGlite fixture boots its own database. Avoid contention-driven setup timeouts.
    maxWorkers: 2,
    include: ["src/**/*.test.ts"],
  },
});
