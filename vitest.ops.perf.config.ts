import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/ops/performance/**/*.test.ts"],
    fileParallelism: false,
  },
});
