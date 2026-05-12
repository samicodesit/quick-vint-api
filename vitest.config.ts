import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "utils/**/*.test.ts", "api/**/*.test.ts"],
  },
});
