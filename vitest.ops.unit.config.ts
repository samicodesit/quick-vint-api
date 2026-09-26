import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/ops/unit/**/*.test.ts"] },
});
