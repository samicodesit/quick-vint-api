import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { OPENAI_DRAFT_PILOT_PERCENT: "0" },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
